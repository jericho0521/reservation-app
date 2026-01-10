import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
    try {
        const { data, error } = await supabase
            .from('venues')
            .select('*')
            .order('name');

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Failed to fetch venues:', error);
        return NextResponse.json(
            { error: 'Failed to fetch venues' },
            { status: 500 }
        );
    }
}
