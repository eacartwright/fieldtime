import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = "https://tuyfzwsxsbkxpshwgxwq.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR1eWZ6d3N4c2JreHBzaHdneHdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MjUzMDEsImV4cCI6MjA5MjEwMTMwMX0.Ufjv1YZ7E360khPC99-dcJ8G2HPkXuY0Twy4AQQJ9r8"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)