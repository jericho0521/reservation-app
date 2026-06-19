"use client";

import { createClient } from "@/lib/supabase-browser";

export interface AdminSignInCredentials {
    email: string;
    password: string;
}

export interface AdminAuthResult {
    errorMessage: string | null;
}

export interface AdminAuthClient {
    signInWithPassword(credentials: AdminSignInCredentials): Promise<AdminAuthResult>;
    signOut(): Promise<AdminAuthResult>;
}

let adminAuthClient: AdminAuthClient | undefined;

export function createAdminAuthClient(): AdminAuthClient {
    const supabase = createClient();

    return {
        async signInWithPassword(credentials) {
            const { error } = await supabase.auth.signInWithPassword(credentials);
            return { errorMessage: error?.message ?? null };
        },
        async signOut() {
            const { error } = await supabase.auth.signOut();
            return { errorMessage: error?.message ?? null };
        },
    };
}

export function getAdminAuthClient(): AdminAuthClient {
    adminAuthClient ??= createAdminAuthClient();
    return adminAuthClient;
}
