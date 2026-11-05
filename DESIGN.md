---
name: WattNot
description: The day-ahead spot price of one bidding zone, read in one glance from a stack of iOS cards.
colors:
  accent: "#10263f"
  on-accent: "#ffffff"
  accent-soft: "#e8ebf0"
  ground: "#f2f2f7"
  card: "#ffffff"
  ink: "#1c1c1e"
  ink-secondary: "#5f6773"
  hairline: "#e2e4e9"
  control: "#e9e9ee"
  shade: "rgba(28, 28, 30, 0.05)"
  unleveled: "#d6dce3"
  signal-zero-or-negative: "#2276b0"
  signal-cheap: "#4fb874"
  signal-normal: "#c9d3de"
  signal-expensive: "#efbf3a"
  signal-very-expensive: "#b8327a"
  signal-cheap-text: "#2e7d4f"
  signal-normal-text: "#4b5d70"
  signal-expensive-text: "#8f6200"
typography:
  zone:
    fontFamily: "SF Pro, -apple-system, system-ui"
    fontSize: "28pt"
    fontWeight: 700
    lineHeight: "34pt"
    letterSpacing: "-0.4pt"
  big-price:
    fontFamily: "SF Pro, -apple-system, system-ui"
    fontSize: "36pt"
    fontWeight: 700
    lineHeight: "42pt"
    letterSpacing: "-0.8pt"
    fontFeature: "tnum"
  window:
    fontFamily: "SF Pro, -apple-system, system-ui"
    fontSize: "28pt"
    fontWeight: 600
    lineHeight: "34pt"
    fontFeature: "tnum"
  title:
    fontFamily: "SF Pro, -apple-system, system-ui"
    fontSize: "20pt"
    fontWeight: 600
    lineHeight: "25pt"
  headline:
    fontFamily: "SF Pro, -apple-system, system-ui"
    fontSize: "17pt"
    fontWeight: 600
    lineHeight: "22pt"
  body:
    fontFamily: "SF Pro, -apple-system, system-ui"
    fontSize: "17pt"
    fontWeight: 400
    lineHeight: "22pt"
    fontFeature: "tnum"
  subhead:
    fontFamily: "SF Pro, -apple-system, system-ui"
    fontSize: "15pt"
    fontWeight: 400
    lineHeight: "20pt"
    fontFeature: "tnum"
  footnote:
    fontFamily: "SF Pro, -apple-system, system-ui"
    fontSize: "13pt"
    fontWeight: 400
    lineHeight: "18pt"
  caption:
    fontFamily: "SF Pro, -apple-system, system-ui"
    fontSize: "12pt"
    fontWeight: 400
    lineHeight: "16pt"
  tag:
    fontFamily: "SF Pro, -apple-system, system-ui"
    fontSize: "13pt"
    fontWeight: 600
    lineHeight: "16pt"
rounded:
  card: "16pt"
  block: "12pt"
  chip: "8pt"
  tag: "6pt"
spacing:
  xs: "4pt"
  s: "8pt"
  m: "12pt"
  l: "16pt"
  xl: "24pt"
  xxl: "32pt"
  gutter: "16pt"
components:
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16pt"
  now-block:
    backgroundColor: "{colors.signal-normal}"
    textColor: "{colors.ink}"
    typography: "{typography.big-price}"
    rounded: "{rounded.block}"
    padding: "24pt 16pt"
  tag-zero-or-negative:
    backgroundColor: "{colors.signal-zero-or-negative}"
    textColor: "{colors.on-accent}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "0 8pt"
    height: "26pt"
  tag-cheap:
    backgroundColor: "{colors.signal-cheap}"
    textColor: "{colors.ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "0 8pt"
    height: "26pt"
  tag-normal:
    backgroundColor: "{colors.signal-normal}"
    textColor: "{colors.ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "0 8pt"
    height: "26pt"
  tag-expensive:
    backgroundColor: "{colors.signal-expensive}"
    textColor: "{colors.ink}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "0 8pt"
    height: "26pt"
  tag-very-expensive:
    backgroundColor: "{colors.signal-very-expensive}"
    textColor: "{colors.on-accent}"
    typography: "{typography.tag}"
    rounded: "{rounded.tag}"
    padding: "0 8pt"
    height: "26pt"
  tag-small:
    rounded: "{rounded.tag}"
    padding: "0 6pt"
    height: "22pt"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.headline}"
    rounded: "{rounded.block}"
    padding: "0 20pt"
    height: "50pt"
  button-secondary:
    textColor: "{colors.accent}"
    typography: "{typography.headline}"
    rounded: "{rounded.block}"
    padding: "0 20pt"
    height: "50pt"
  day-bar:
    backgroundColor: "{colors.control}"
    textColor: "{colors.ink-secondary}"
    typography: "{typography.subhead}"
    height: "36pt"
  day-bar-pill:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
  segmented:
    backgroundColor: "{colors.control}"
    textColor: "{colors.ink}"
    height: "36pt"
  segmented-selected:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  list-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "56pt"
  list-row-pressed:
    backgroundColor: "{colors.control}"
  zone-row-pressed:
    backgroundColor: "{colors.accent-soft}"
  legend-swatch:
    width: "12pt"
    height: "12pt"
---

# Design System: WattNot

## Overview

**Creative North Star: "The Glance Card"**

WattNot reads like an iOS system widget. A stack of white cards sits on the grouped grey ground, and each card gives one answer. The first card carries the one loud element of the screen: the mean price of this hour, on a block in the colour of its level. Everything else is ink on white, ranked by size and weight.

The platform is iOS, and native behaviour comes before invention. The app uses the native tab bar, form sheets with a grabber, the native segmented control, SF Symbols and SF Pro. Sizes follow the iOS text styles, so Dynamic Type scales them. The app runs in light appearance only, by owner decision.

Colour has two jobs. Switch Navy marks what a finger can press. The five Signal colours mark price levels and nothing else. The Signal palette is shared with the app icon (`release/icon/icon.svg` on branch `overhaul/release`).

**Key Characteristics:**

- White cards with 16 pt corners and a hairline border, on the iOS grouped grey.
- One coloured block per screen: the now block, lifted by a glow in its own colour.
- Switch Navy for every control. Signal colours only for price levels.
- Tabular figures for every price, time and amount.
- Native iOS controls, tinted with the theme, in their system shape.

## Colors

A grey and white iOS frame, one navy for controls, and five Signal colours that each mean one price level.

### Primary

- **Switch Navy** (`accent`): the primary button fill, the outline and label of the secondary button, links, the tab bar tint, the info symbol, the zone checkmark, the selected duration segment and the pull to refresh spinner. It is the background of the app icon, so green on screen means cheap only. Contrast 15.3:1 on white.
- **Label White** (`on-accent`): text on Switch Navy, and on the blue and magenta Signal fills.
- **Navy Wash** (`accent-soft`): a zone row while a finger is down.

### Secondary

The Signal palette. Each fill names one price level and never appears for anything else.

- **Signal Blue** (`signal-zero-or-negative`): zero or negative prices.
- **Signal Green** (`signal-cheap`): cheap.
- **Signal Silver** (`signal-normal`): normal.
- **Signal Amber** (`signal-expensive`): expensive.
- **Signal Magenta** (`signal-very-expensive`): very expensive.

Three Signal colours fail as text on white, so they have a deeper text hue:

- **Deep Signal Green** (`signal-cheap-text`): a cheap price as text.
- **Signal Slate** (`signal-normal-text`): a normal price as text.
- **Deep Signal Amber** (`signal-expensive-text`): an expensive price as text.

### Neutral

- **Grouped Grey** (`ground`): the page under the cards, the tab screens and the sheets.
- **Card White** (`card`): every card.
- **Ink** (`ink`): primary text, the chart zero line, the now rule, the scrub bar and the best window bracket.
- **Secondary Grey** (`ink-secondary`): secondary text, chart value and hour labels, captions, chevrons and the unselected day bar labels. Contrast 5.0:1 on the ground.
- **Hairline** (`hairline`): card borders, row rules and the line between the min and max columns.
- **Control Grey** (`control`): the track of the day bar and of the segmented control, and a settings row while a finger is down.
- **Unleveled Grey** (`unleveled`): the now block and the chart fields of a day without levels, so no level is implied.
- **Window Shade** (`shade`): ink at 5 percent, the column behind the best window in the chart.

### Named Rules

**The Two Jobs Rule.** Switch Navy marks a control. A Signal colour marks a price level. Neither one does the other job.

**The Word On Colour Rule.** Every Signal fill carries its level word, in a tag, on the chart or beside a legend swatch. Three prices are the exception: the next hour, and the min and max of the day. Each one carries its level as the hue of its text alone, and VoiceOver reads the word.

**The One Palette Rule.** The Signal values and Switch Navy are shared with the app icon. Change them only together with `release/icon/icon.svg`.

**The Text Pair Rule.** Blue and magenta fills take white text. Green, silver and amber fills take ink. Every pair holds at least 4.5:1.

**The Text Hue Rule.** A price in the hue of its level sits on white. Blue and magenta keep their fill value as text. Green, silver and amber use their deeper text hue. Each text hue holds at least 4.5:1 on white.

## Typography

**Display Font:** SF Pro (system font)
**Body Font:** SF Pro (system font)

**Character:** One family, ranked by weight and size. Tabular figures keep prices and times in calm columns.

### Hierarchy

- **Zone** (700, 28 pt, 34 pt line, -0.4 tracking): iOS Title 1 in bold. The Settings title and the first run title.
- **Big price** (700, 36 pt, 42 pt line, -0.8 tracking, tabular): the hour price in the now block. The declared size exception.
- **Window** (600, 28 pt, 34 pt line, tabular): the best window range, or "Now is the cheapest time".
- **Title** (600, 20 pt, 25 pt line): iOS Title 3. The date of a day page, the sheet titles, and the min and max prices.
- **Headline** (600, 17 pt, 22 pt line): card heads, button labels and the scrubbed quarter range.
- **Body** (400, 17 pt, 22 pt line, tabular): row labels, the next hour range, the min and max ranges, sheet prose. A value in a row sets it at 600.
- **Subhead** (400, 15 pt, 20 pt line, tabular): the zone line under the date, the "Average" range in the now block, the percent change, "Min price" and "Max price", the scrubbed price, the day bar labels.
- **Footnote** (400, 13 pt, 18 pt line): sublabels, legend words, zone codes, list group titles at 600.
- **Caption** (400, 12 pt, 16 pt line): the price caption, the source notes, the licence link and the updated note.
- **Tag** (600, 13 pt, 16 pt line): the level word in a tag. The small tag sets it at 12 pt.

### Named Rules

**The Tabular Rule.** Every price, time and amount uses tabular figures.

**The One Exception Rule.** The big price is the one size outside the iOS text styles. Do not add another.

**The Rank By Weight Rule.** Hierarchy comes from weight (400, 500, 600, 700) and size. A level hue marks a level, never a rank.

**The Display Cap Rule.** The date of a day page, the best window, and the titles of the first run and of an uncovered zone stop growing with Dynamic Type at 1.6 times (`DISPLAY_SCALE_CAP`). The big price stops at 1.4 times, the day bar labels at 1.3 times. Chart text grows up to 1.5 times. Body text is never capped.

## Layout

A single scrolling column on iPhone, portrait only. A 16 pt gutter holds every card, cards sit 16 pt apart, and a card pads its content by 16 pt. Spacing steps are 4, 8, 12, 16, 24 and 32 pt. Touch targets are at least 44 pt on each side.

The Prices tab opens with the day bar under the status bar: Yesterday, Today and Tomorrow. A horizontal pager below it holds one page per day, and a swipe moves the bar's pill with the finger. Each page has a fixed order:

1. The header: the date in title, the zone name and code in subhead secondary, and the info symbol at the right.
2. The now card, on Today only.
3. The chart card: the readout, the step chart, then the min and max columns.
4. The Best time card.
5. The footer: the legend, the caption with the source notes, the licence link, and the updated note when offline.

The native tab bar holds Prices and Settings. Settings shows its title in the zone style, one card of rows, and the version in footnote. The zone list opens as a form sheet with detents at 70 percent and full height. About opens as a full form sheet. Both show the grabber, a 20 pt title and a navy Done.

Values sit right aligned against left aligned labels. Rows inside a card are separated by a hairline, never by boxes. Text wraps at large sizes rather than truncates.

## Elevation & Depth

The system is flat with one glow. Cards are flat white fields, set apart from the grey ground by a hairline border and no shadow. The now block is the one lifted element: a soft glow in the block's own colour sits under it, so the level reads as light rather than ink. The day bar pill carries the small shadow of a native segmented control.

### Shadow Vocabulary

- **Level Glow** (the block's fill, opacity 0.35, radius 14 pt, offset 0 by 8 pt): under the now block only.
- **Pill Lift** (ink, opacity 0.12, radius 3 pt, offset 0 by 1 pt): under the day bar pill only.

### Named Rules

**The One Glow Rule.** Only the now block glows. No card, button or tag takes a shadow.

## Shapes

Gentle iOS corners on every container: 16 pt on cards, 12 pt on the now block and the buttons, 8 pt on the day bar pill inside a 10 pt track, and 6 pt on tags. The chart is the square exception: its hourly fields, the now head, the scrub bar and the legend swatches keep square corners, so the steps join edge to edge. The native segmented control keeps its system shape.

Strokes appear only as lines with a job: hairline card borders and row rules, the 1.5 pt navy outline of the secondary button, the 1.5 pt zero line, the 2 pt now rule and the 2 pt bracket.

## Components

### Cards

White fields that each answer one question.

- **Corner Style:** 16 pt.
- **Background:** Card White on Grouped Grey.
- **Shadow Strategy:** none. See the One Glow Rule.
- **Border:** a hairline in Hairline.
- **Internal Padding:** 16 pt. The chart card and the settings list set it to 0 and pad their own parts.

### Now Card

The one loud element. The card head reads "Price now" with the tag of the current hour. Below it, the now block: the mean price of the current hour in the big price size with its unit in body, and "Average 14:00–15:00" in subhead. The block fills with the Signal colour of the hour level and takes its text pair. Under the block, when the next hour is published, one row: the next hour range on the left, its mean price at 600 in its text hue, and the change in percent ("▲ 3%") in subhead secondary. The row carries no tag.

### Prices

Every price shows the amount and the unit in tabular figures, with a typographic minus for a negative value. A price converted from euros carries no "≈", and the footer names the ECB rate date. Ranges use an en dash: "14:00–15:00".

### Tags

The level word on its Signal fill, 26 pt high with 8 pt side padding and 6 pt corners. The small tag is 22 pt high with 6 pt padding. A tag sits in the now card head, in the chart readout while scrubbing, and in the About level list.

### Buttons

Navy blocks with a plain label, at least 50 pt high, 20 pt side padding and 12 pt corners.

- **Primary:** a Switch Navy fill and a white headline label. One per view, for the main action.
- **Secondary:** a 1.5 pt Switch Navy outline and a navy headline label.
- **Pressed:** opacity 0.55 while a finger is down (`PRESSED`). Every pressable dims this way, except list rows.

### Day Bar

Yesterday, Today and Tomorrow in one Control Grey track, 36 pt high. A white pill with the Pill Lift marks the day and follows the pager position mid swipe. The selected label is ink at 600, the others are Secondary Grey at 500. With Reduce Motion on, a tap pages without animation.

### Segmented Control

The native iOS segmented control picks the Best time duration, "1 h" to "4 h", 200 pt wide and 36 pt high. It shows a Control Grey track, ink 13 pt labels, and a Switch Navy selected segment with a white 600 label.

### Lists

Rows are at least 56 pt high with a hairline between them. The name is in body and the zone code in footnote secondary. A Switch Navy checkmark marks the current zone. A pressed zone row fills with Navy Wash. A pressed settings row fills with Control Grey. Settings rows end in a Secondary Grey chevron.

### Navigation

The native tab bar, tinted Switch Navy, holds Prices (`chart.bar.fill`) and Settings (`gearshape.fill`). The day bar moves between days. The info symbol opens About. Icons are SF Symbols at semibold weight.

### Step Chart

The signature. Hourly steps are flat fields in their Signal colour, joined edge to edge with no seam. The plot is 156 pt high. Below it sit 20 pt of hour labels and 28 pt for the bracket. Both heights and every chart text size scale with Dynamic Type, capped at 1.5 times. An ink zero line, 1.5 pt, runs under the fields. Faint ink grid lines at 14 percent carry right aligned value labels, each on a 3 pt halo. A 2 pt ink rule with an 8 pt square head and the word "now" marks the present. An ink bracket under the hour labels, titled "best N h", marks the best window, and Window Shade marks it in the plot. Runs of very expensive and of zero or negative hours carry their level word above them.

A finger on the chart reads the quarter under it as an ink bar and hides the now rule. The readout shows at touch down. A horizontal move of 6 pt starts the scrub ahead of the pager. A vertical move of 8 pt cancels it, so the page scrolls. VoiceOver adjusts through the hours.

### Readout

Two lines reserved above the chart, so the chart does not move. At rest: the "Hourly prices" heading, with no hint. While scrubbing: the quarter range in headline with its small tag, then its price in subhead.

### Min and Max

Two columns under the chart, below a hairline and split by a hairline: min on the left, max on the right. Each column stacks "Min price" or "Max price" in subhead secondary, the range of the quarter in body ("06:00–06:15"), and the price in title in its text hue, with the unit in subhead. No tag.

### Legend

Square 12 pt swatches with their word in footnote, only for the levels the day shows.

## Do's and Don'ts

### Do:

- **Do** pair every Signal fill with its level word.
- **Do** use the deeper text hue for a cheap, normal or expensive price set as text.
- **Do** set every price, time and amount in tabular figures.
- **Do** use the iOS text styles so Dynamic Type scales the text.
- **Do** keep touch targets at 44 pt or more.
- **Do** change the Signal palette only together with the app icon.
- **Do** prefer the native iOS control, as with the tab bar, the segmented control and the form sheets. Tint it with the theme and keep its system shape.
- **Do** dim a pressed control to opacity 0.55.

### Don't:

- **Don't** put a shadow on a card, button or tag. Only the now block glows.
- **Don't** use a Signal colour for a control, or Switch Navy for a price level.
- **Don't** set a light Signal fill (green, silver, amber) as text on white.
- **Don't** round the chart fields, the now head or the legend swatches.
- **Don't** add a dark appearance. The app is light only.
- **Don't** add a size outside the iOS text styles beyond the big price.
- **Don't** add an outlined control beyond the secondary button.
