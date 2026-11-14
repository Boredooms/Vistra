# Acme API Reference

The Acme public API lets you manage projects and team members programmatically. It is available on the Team and
Enterprise plans.

## Authentication

Send your API token in the `Authorization: Bearer <token>` header. Tokens are created under Settings, then API tokens,
and are shown only once. Tokens inherit the permissions of the member who created them.

## Rate limits

The Team plan allows 10,000 requests per day per workspace. Requests above the limit receive HTTP 429 with a
`Retry-After` header. Enterprise limits are set by contract.

## Projects

`GET /v1/projects` lists projects. `POST /v1/projects` creates a project and requires a `name` of 1 to 80 characters.
A project has a status of `active`, `overdue` or `archived`. The status becomes `overdue` when the workspace has an
unpaid invoice past its due date.

## Team members

`POST /v1/members/invites` invites a teammate and requires a `name` and an `email`. Only owners and admins can invite
members. An invited member appears in the team list with the status `invited` until they accept the email invitation.
