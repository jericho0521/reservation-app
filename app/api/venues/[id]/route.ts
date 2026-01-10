import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data, error } = await supabase
            .from('venues')
            .select('*, equipment(*)')
            .eq('id', id)
            .single();

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error) {
        console.error('Failed to fetch venue:', error);
        return NextResponse.json(
            { error: 'Failed to fetch venue' },
            { status: 500 }
        );
    }
}
