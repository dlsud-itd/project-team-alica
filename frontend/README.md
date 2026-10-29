# Frontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.7.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Organizer event handling

The organizer dashboard is available at `/organizer/dashboard`; an event's registrants are available at `/organizer/events/:eventId/registrants`. Organizer event and registrant types and the mock-backed data service live under `src/app/core/organizer/`. The service is the data-access boundary for replacing fixture data with Supabase queries.

When connecting Supabase, query `events` by the authenticated organizer UUID and rely on database Row Level Security policies to enforce ownership. Keep `organizer_id`, `event_id`, and `attendee_id` as UUID foreign keys, and apply the same ownership policy to registrant queries and mutations; client-side route guards are not a substitute for RLS.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
