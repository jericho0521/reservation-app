import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { jsonError, supabaseErrorStatus } from '@/app/api/api-utils';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const { data, error } = await supabase()
            .from('services')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            return jsonError(
                supabaseErrorStatus(error) === 404 ? 'Service not found' : 'Failed to fetch service',
                supabaseErrorStatus(error)
            );
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('Failed to fetch service:', error);
        return jsonError('Failed to fetch service', 500);
    }
}
