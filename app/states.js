export function MissingSetting({ names }) {
  return (
    <main className="state-wrap">
      <div className="state-card state-missing">
        <span className="state-tag">Setting missing</span>
        <h1>The app is not configured yet</h1>
        <p>
          This setting is missing or empty in <code>.env.local</code>:
        </p>
        <ul className="state-list">
          {names.map((n) => (
            <li key={n}>
              <code>{n}</code>
            </li>
          ))}
        </ul>
        <p className="state-note">
          Add the missing setting to{" "}
          <code>renewal-board/.env.local</code> and restart the dev server. The
          board needs both <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>. No Supabase call was
          made.
        </p>
      </div>
    </main>
  );
}

export function CallFailed({ message, table }) {
  return (
    <main className="state-wrap">
      <div className="state-card state-failed">
        <span className="state-tag">Supabase call failed</span>
        <h1>The board could not load its data</h1>
        <p>
          The app reached Supabase but the request failed. Nothing was changed.
          This is not an empty table.
        </p>
        <pre className="state-error">{message}</pre>
        <p className="state-note">
          Most common cause: the <code>{table}</code> table does not exist yet.
          Run the schema SQL in the Supabase SQL editor, then reload. If the
          table does exist, check the project URL and browser key.
        </p>
      </div>
    </main>
  );
}

export function EmptyTable() {
  return (
    <main className="state-wrap">
      <div className="state-card state-empty">
        <span className="state-tag">Table is empty</span>
        <h1>Connected, but there are no records</h1>
        <p>
          The <code>records</code> table exists and the call succeeded, but it
          has no rows. This is not a configuration error and not a failed call.
        </p>
        <p className="state-note">
          Run the demo-data SQL in the Supabase SQL editor to fill the board,
          then reload this page.
        </p>
      </div>
    </main>
  );
}
