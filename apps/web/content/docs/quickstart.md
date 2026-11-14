# Quickstart

VISTRA adds an assistant to your product that answers from your documentation, points at real controls with a visible cursor, and runs actions you approve. You integrate it with one npm package and one server route.

## Create an application

Sign in, open Applications and choose New application. Give it a name and add the origin where your product runs, for example https://app.acme.com. The SDK can only start sessions from origins you list. Any other origin is rejected with the error code ORIGIN_NOT_ALLOWED.

## Create an API key

Open API keys and choose Create key. Pick the Embed (server) preset for the key your backend uses to start sessions. The full key is shown once. Store it in your server environment as VISTRA_API_KEY and never ship it to the browser.

## Install the SDK

Run npm install @boredooms/vistra-sdk in your frontend. Add a server route that exchanges your API key for a short-lived session token. The browser only ever receives that token, which expires after 15 minutes and is refreshed automatically at 80 percent of its lifetime.

## Add your knowledge

Open Knowledge and add your documentation as Markdown, plain text, HTML or a public URL. VISTRA splits each document by heading, embeds the chunks and indexes them for hybrid search. Answers cite the exact section they came from. If nothing in your documents supports an answer, the assistant says it could not find it instead of guessing.

## Mark the controls guides can use

Add a data-vistra-target attribute to the buttons, links and fields you want guides to be able to point at. Fields that hold secrets can carry data-vistra-private so they are never captured.
