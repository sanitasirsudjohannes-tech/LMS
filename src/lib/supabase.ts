import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xdxiwtweztrrlqhfgmhl.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkeGl3dHdlenRycmxxaGZnbWhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxNzc3ODAsImV4cCI6MjEwMzc1Mzc4MH0.u-f2ajaQ4uCpLfxuS4HN-L5FkbpJRYguTqRLmkOpEII';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
