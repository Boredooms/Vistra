# Guides and the Ghost Cursor

A guide is a sequence of real controls on your page. The Ghost Cursor moves to each one, highlights it, explains why it is pointing there, and waits for the user to act. Guide Mode never clicks or types for the user and is never reported as a completed business action.

## How a target is found

For every step the cursor looks for the element in a fixed order: the data-vistra-target attribute, then the element's accessible role and name, then its label or aria-label, then a stable data attribute, then a validated CSS selector, then its visible text. Screen coordinates are used last and only if you enable allowCoordinateFallback.

## What the cursor checks before it moves

Each step must exist, be visible, be interactable, stay stable for a few frames and not be covered by another element. If the control has not rendered yet, for example because a dialog is still opening, the cursor keeps looking for up to four seconds and then reports TARGET_MISSING.

## Reasoning bubbles

Each step can carry a short reason. The cursor shows it in a bubble beside the pointer, typed out like a comment. The reason is a user-safe explanation written by the planner, not the model's private chain of thought.

## Reduced motion

When the visitor prefers reduced motion the cursor does not travel. The target is highlighted immediately and the tooltip still explains the step.

## Cleanup

Calling destroy on the SDK removes every listener, observer, timer and DOM node the cursor created.
