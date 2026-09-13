import { createSupabaseClient, readSupabaseConfig } from "@/lib/supabase";
import Board from "./board";
import { CallFailed, EmptyTable, MissingSetting } from "./states";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { url, key, missing } = readSupabaseConfig();

  if (missing.length > 0) {
    return <MissingSetting names={missing} />;
  }

  const supabase = createSupabaseClient(url, key);
  const { data, error } = await supabase
    .from("records")
    .select("*")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) {
    return <CallFailed message={error.message} table="records" />;
  }

  if (!data || data.length === 0) {
    return <EmptyTable />;
  }

  return <Board initialRecords={data} />;
}
