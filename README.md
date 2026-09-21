# Komoot Routing Buddy

A simple browser extension for making MTB trail difficulty easier to read in Komoot.

## What it does

- Highlights trail difficulty directly on the map
- Lets you set a max level to show and colors for each level
- Marks harder trails with a dark red warning (configurable)
- Remembers your preferred map and panel settings between Komoot sessions

## How it looks

### Enabled

![Enabled view](enabled.png)

### Disabled

![Disabled view](disabled.png)

## Install

1. Open your browser extensions page.
2. Turn on Developer mode.
3. Choose Load unpacked and select this folder.
4. Open a Komoot route planner and use the extension.

This is a visual helper only. It does not change the route itself.

## Current state

The extension is ready to use for MTB route planning and trail readability.

## Trail label readability

Highlighted and avoid labels use a thin 0.5px black outline. Label colours are brightened toward white only when needed to reach a calculated 7:1 contrast against that outline; trail-line colours stay unchanged. This measures contrast against the outline, not the underlying terrain. Switching visuals Off restores the original label colours and outlines.
