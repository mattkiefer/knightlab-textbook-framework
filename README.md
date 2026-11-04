# Knight Lab Textbook Framework

This repository contains the reusable VS Code extension and Dev Container template. Textbook material lives in a separate content repository.

## Current book

The extension's book picker is configured in `bookCatalog.js`. It currently lists the Introduction to Data book at:

`https://github.com/mattkiefer/knightlab-textbook-content`

To add another book later, add a catalog entry and give the content repository a matching `textbook.json` `id`.

## Student flow

1. Run `install-mac.command` on macOS or `install-windows.bat` on Windows. The installer installs prerequisites, packages and installs the framework extension, and starts Docker.
2. Click the Knight Lab icon in the Activity Bar and select **Open Textbook**, or run **Knight Lab: Open Textbook** from the Command Palette.
3. Choose a book and a parent folder for its local checkout.
4. The extension clones the content repository, adds its reusable Dev Container files locally, and opens it. The table of contents is generated from folders directly inside `chapters/`.
5. Use **Update Textbook** in the table of contents to fetch updates from that book repository's `main` branch.

The installers download the latest framework source from this repository's `main` branch and package the extension locally. Node.js is used only for that packaging step.

Chapter folders can have optional numeric prefixes, including decimals (for example `1.2-data`). The first `.py`, `.R`, or `.js` file in a chapter folder is opened as its starter file. A `lesson.html` file provides the lesson page.

## Developing

Run `npm test` to test chapter discovery and sorting. To test the extension in VS Code, open this folder and use the standard Extension Development Host workflow.
