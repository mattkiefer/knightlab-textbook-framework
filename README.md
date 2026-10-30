# Knight Lab Textbook Framework

This repository contains the reusable VS Code extension and Dev Container template. Textbook material lives in a separate content repository.

## Current book

The extension's book picker is configured in `bookCatalog.js`. It currently lists the Introduction to Data book at:

`https://github.com/mattkiefer/knightlab-textbook-content`

To add another book later, add a catalog entry and give the content repository a matching `textbook.json` `id`.

## Student flow

1. Install the Knight Lab Textbook Framework extension and VS Code's Dev Containers extension.
2. Run **Knight Lab: Open Textbook**.
3. Choose a book and a parent folder for its local checkout.
4. The extension clones the content repository, adds its reusable Dev Container files locally, and opens it. The table of contents is generated from folders directly inside `chapters/`.
5. Use **Update Textbook** in the table of contents to fetch updates from that book repository's `main` branch.

Chapter folders can have optional numeric prefixes, including decimals (for example `1.2-data`). The first `.py`, `.R`, or `.js` file in a chapter folder is opened as its starter file. A `lesson.html` file provides the lesson page.

## Developing

Run `npm test` to test chapter discovery and sorting. To test the extension in VS Code, open this folder and use the standard Extension Development Host workflow.
