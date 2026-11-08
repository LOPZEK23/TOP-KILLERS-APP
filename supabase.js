const SUPABASE_URL = "https://dopkhsplndcrfmdzpzlt.supabase.co";

const SUPABASE_ANON_KEY = "sb_publishable_sNhjTe3o4ivCVtXqBauP9w_wh4dHcLe";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
);