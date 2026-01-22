/**
 * Supabase 客户端配置
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dueyigipntpdrwgnwhhl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR1ZXlpZ2lwbnRwZHJ3Z253aGhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgzMzY5MTAsImV4cCI6MjA2MzkxMjkxMH0.p4nZPaOJcMwywCPQHCNi0y8EbWvZXu7ydNJOVqXDsgo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
