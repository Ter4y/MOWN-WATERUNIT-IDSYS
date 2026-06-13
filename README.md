# Terry MOW - Settings backend

This repository adds a small Express backend that stores application settings in MongoDB and serves the existing `index.html`.

Quick start

1. Install dependencies

```bash
npm install
```

2. Create a `.env` file (copy `.env.example`) and set values if needed.

3. Start the server

```bash
npm start
```

The server will run on `http://localhost:3000` by default and exposes the following endpoints:

- `GET /api/settings/:id` - get settings (e.g. `config`)
- `POST /api/settings/:id` - upsert settings (body should be JSON)

`index.html` now attempts a best-effort sync of the `settings` store with these endpoints.
