import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { jsonError } from '@/app/api/api-utils';

export async function GET() {
    try {
        const { data, error } = await supabase()
            .from('venues')
            .select('*')
            .order('name');

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Failed to fetch venues:', error);
        return jsonError('Failed to fetch venues', 500);
    }
}
