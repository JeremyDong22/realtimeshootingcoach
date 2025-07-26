#!/usr/bin/env node

// Build script to inject environment variables into the Supabase config
const fs = require('fs');
const path = require('path');

// Read environment variables
const VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://wdpeoyugsxqnpwwtkqsl.supabase.co';
const VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkcGVveXVnc3hxbnB3d3RrcXNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQxNDgwNzgsImV4cCI6MjA1OTcyNDA3OH0.9bUpuZCOZxDSH3KsIu6FwWZyAvnV5xPJGNpO3luxWOE';

if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
  console.error('Error: Missing required environment variables');
  console.error('Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

// Read the template file
const templatePath = path.join(__dirname, 'assets/js/supabase-config.template.js');
const template = fs.readFileSync(templatePath, 'utf8');

// Replace placeholders with actual values
const config = template
  .replace('__VITE_SUPABASE_URL__', VITE_SUPABASE_URL)
  .replace('__VITE_SUPABASE_ANON_KEY__', VITE_SUPABASE_ANON_KEY);

// Write the config file
const configPath = path.join(__dirname, 'assets/js/supabase-config.js');
fs.writeFileSync(configPath, config);

console.log('✅ Supabase config generated successfully!');
console.log(`   URL: ${VITE_SUPABASE_URL}`);
console.log(`   Key: ${VITE_SUPABASE_ANON_KEY.substring(0, 20)}...`);