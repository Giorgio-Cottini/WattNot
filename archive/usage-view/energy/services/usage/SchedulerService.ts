// Receding-Horizon Greedy + Large-Neighborhood Search (15-min slots)
// Pure TS implementation, mobile-friendly

export type TimePref = 'day' | 'night' | 'no_preference';

export interface SchedAppliance {
    id: string;
    name: string;
    powerKW: number;          // p_i
    durationSlots: number;    // d_i in 15-minute slots
    canRunInBannedHours: boolean;
    timePreference: TimePref;
    isActive: boolean;
}

export interface SchedulerRules {
    maxKW: number | null;           // if null → unlimited
    bannedRanges: { start: number; end: number }[]; // in 15-min slots, modulo horizon base
    scheduleHorizonHours: number;   // e.g., 6..availableHours
    noTomorrow?: boolean;           // prune starts that touch next day (if horizon spans it)
    noAfterHours?: number;          // prune starts s >= now + X hours
    rescheduleFromNow?: boolean;    // forbid starts before now for selected set
}

export interface SlotPrice { slot: number; price: number; }

export interface SchedulerInputs {
    nowSlot: number;                 // current slot index relative to base (0 = first slot of horizon)
    prices: SlotPrice[];             // 15-min slots, length = availableSlots (<= 96)
    appliances: SchedAppliance[];
    rules: SchedulerRules;
}

export interface ScheduleAssignment { applianceId: string; startSlot: number; }
export interface ScheduleResult { assignments: ScheduleAssignment[]; totalCost: number; }

// Time resolution used by the scheduler and UI (15‑minute slots)
export const SLOTS_PER_HOUR = 4;
export const DAY_SLOTS = 24 * SLOTS_PER_HOUR; // 24h * 4 (15-minute intervals)

export class SchedulerService {
    public compute(inputs: SchedulerInputs, timeBudgetMs = 80): ScheduleResult {
        const horizonSlots = Math.min(
            inputs.prices.length,
            Math.max(SLOTS_PER_HOUR * inputs.rules.scheduleHorizonHours, 12)
        );
        const H = Array.from({ length: horizonSlots }, (_, s) => s);
        // Reserve a 10% margin of the configured maxKW for incidental household load
        const capacity = (inputs.rules.maxKW != null)
            ? inputs.rules.maxKW * 0.9
            : Infinity;
        const priceArr = new Array<number>(horizonSlots).fill(0);
        inputs.prices.slice(0, horizonSlots).forEach(p => { priceArr[p.slot] = p.price; });

        const allowedStarts = new Map<string, number[]>();
        const prefPenalty = (slot: number, pref: TimePref): number => {
            if (pref === 'no_preference') return 0;
            const hour = (slot / SLOTS_PER_HOUR) % 24; // 15-min slots (4 slots = 1 hour)
            const isDay = hour >= 8 && hour < 22;
            return (pref === 'day' ? (isDay ? 0 : 0.8) : (!isDay ? 0 : 0.8));
        };

        // build banned map for fast check
        const banned = new Array<boolean>(horizonSlots).fill(false);
        for (const r of inputs.rules.bannedRanges || []) {
            let h = r.start % horizonSlots;
            while (h !== r.end % horizonSlots) {
                banned[h] = true; h = (h + 1) % horizonSlots; if (h === r.start % horizonSlots) break;
            }
        }

        const within = (s: number) => s >= 0 && s < horizonSlots;

        for (const a of inputs.appliances) {
            if (!a.isActive) { allowedStarts.set(a.id, []); continue; }
            const S: number[] = [];
            for (let s = inputs.nowSlot; s <= horizonSlots - a.durationSlots; s++) {
                if (inputs.rules.rescheduleFromNow === false && s < inputs.nowSlot) continue;
                if (inputs.rules.noAfterHours !== undefined) {
                    const limitSlot = inputs.nowSlot + Math.max(0, Math.floor(inputs.rules.noAfterHours * SLOTS_PER_HOUR));
                    if (s >= limitSlot) continue;
                }
                if (inputs.rules.noTomorrow) {
                    const crosses = s + a.durationSlots > DAY_SLOTS; // simple day boundary check
                    if (crosses) continue;
                }
                // banned check unless allowed
                let ok = true;
                for (let h = s; h < s + a.durationSlots; h++) {
                    const slot = h;
                    if (!within(slot)) { ok = false; break; }
                    if (banned[slot] && !a.canRunInBannedHours) { ok = false; break; }
                }
                if (ok) S.push(s);
            }
            allowedStarts.set(a.id, S);
        }

        // Score (used for scheduling optimization) includes preference penalty
        const scoreCost = (a: SchedAppliance, s: number): number => {
            let c = 0;
            for (let h = s; h < s + a.durationSlots; h++) {
                c += (priceArr[h] + prefPenalty(h, a.timePreference)) * a.powerKW / SLOTS_PER_HOUR;
            }
            return c;
        };

        // Pure monetary cost (EUR), without preference penalty
        const monetaryCost = (a: SchedAppliance, s: number): number => {
            let c = 0;
            for (let h = s; h < s + a.durationSlots; h++) {
                c += priceArr[h] * a.powerKW / SLOTS_PER_HOUR;
            }
            return c;
        };

        // Greedy init
        const load = new Array<number>(horizonSlots).fill(0);
        const assignments: ScheduleAssignment[] = [];
        const order = [...inputs.appliances]
            .filter(a => a.isActive)
            .sort((a, b) => {
                const Sa = allowedStarts.get(a.id)!.length, Sb = allowedStarts.get(b.id)!.length;
                if (Sa !== Sb) return Sa - Sb; // least flexible first
                return (b.powerKW * b.durationSlots) - (a.powerKW * a.durationSlots);
            });

        const fits = (a: SchedAppliance, s: number) => {
            if (!isFinite(capacity)) return true;
            for (let h = s; h < s + a.durationSlots; h++) {
                if (load[h] + a.powerKW > capacity) return false;
            }
            return true;
        };

        for (const a of order) {
            const starts = (allowedStarts.get(a.id) || []).sort((s1, s2) => scoreCost(a, s1) - scoreCost(a, s2));
            for (const s of starts) {
                if (fits(a, s)) {
                    for (let h = s; h < s + a.durationSlots; h++) load[h] += a.powerKW;
                    assignments.push({ applianceId: a.id, startSlot: s });
                    break;
                }
            }
        }

        // LNS (time-bounded)
        // Total score (for search) and total monetary cost (for reporting)
        const totalScore = () => assignments.reduce((acc, asg) => {
            const a = inputs.appliances.find(x => x.id === asg.applianceId)!;
            return acc + scoreCost(a, asg.startSlot);
        }, 0);

        const totalMonetary = (asgs: ScheduleAssignment[]) => asgs.reduce((acc, asg) => {
            const a = inputs.appliances.find(x => x.id === asg.applianceId)!;
            return acc + monetaryCost(a, asg.startSlot);
        }, 0);

        let best = assignments.slice();
        let bestScore = totalScore();
        const t0 = Date.now();
        while (Date.now() - t0 < timeBudgetMs) {
            // pick a neighborhood: top-2 expensive
            const costs = best.map(asg => {
                const a = inputs.appliances.find(x => x.id === asg.applianceId)!;
                return { asg, c: scoreCost(a, asg.startSlot) };
            }).sort((x, y) => y.c - x.c);
            const N = costs.slice(0, Math.min(2, costs.length)).map(x => x.asg);
            if (N.length === 0) break;

            // reset from best
            assignments.splice(0, assignments.length, ...best.map(x => ({ ...x })));
            load.fill(0);
            for (const asg of assignments) {
                const a = inputs.appliances.find(x => x.id === asg.applianceId)!;
                for (let h = asg.startSlot; h < asg.startSlot + a.durationSlots; h++) load[h] += a.powerKW;
            }

            // remove N
            for (const rem of N) {
                const idx = assignments.findIndex(x => x.applianceId === rem.applianceId);
                if (idx >= 0) {
                    const a = inputs.appliances.find(x => x.id === rem.applianceId)!;
                    for (let h = assignments[idx].startSlot; h < assignments[idx].startSlot + a.durationSlots; h++) load[h] -= a.powerKW;
                    assignments.splice(idx, 1);
                }
            }

            // reinsert greedily
            for (const rem of N) {
                const a = inputs.appliances.find(x => x.id === rem.applianceId)!;
                const starts = (allowedStarts.get(a.id) || []).sort((s1, s2) => scoreCost(a, s1) - scoreCost(a, s2));
                for (const s of starts) {
                    if (fits(a, s)) {
                        assignments.push({ applianceId: a.id, startSlot: s });
                        for (let h = s; h < s + a.durationSlots; h++) load[h] += a.powerKW;
                        break;
                    }
                }
            }

            const curScore = assignments.length ? assignments.reduce((acc, asg) => {
                const a = inputs.appliances.find(x => x.id === asg.applianceId)!;
                return acc + scoreCost(a, asg.startSlot);
            }, 0) : Infinity;
            if (curScore < bestScore) { bestScore = curScore; best = assignments.slice(); }
        }

        // Report pure monetary cost for the chosen schedule
        const bestMonetary = totalMonetary(best);
        return { assignments: best, totalCost: bestMonetary };
    }
}

export default new SchedulerService();


