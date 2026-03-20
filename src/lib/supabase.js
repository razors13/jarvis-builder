// src/lib/supabase.js
// JARVIS OS — Cliente Supabase
// Unico punto de conexion a la base de datos
// Importar desde cualquier modulo: require('../lib/supabase')

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Faltan variables de entorno: SUPABASE_URL y SUPABASE_ANON_KEY requeridas');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = supabase;