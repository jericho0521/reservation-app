export const BUSINESS_NAME = 'Project Play by CW team';
export const BUSINESS_PHONE = '+60 11-1628 1524';
export const BUSINESS_WHATSAPP_NUMBER = '601116281524';

export interface WhatsAppContactData {
    name: string;
    phone: string;
    whatsappUrl: string;
}

export function buildWhatsAppUrl(message: string): string {
    return `https://wa.me/${BUSINESS_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export const HUMAN_SUPPORT_WHATSAPP_URL = buildWhatsAppUrl(
    'Hi Project Play By CW, I would like to speak with a team member.',
);

export const HUMAN_SUPPORT_CONTACT: WhatsAppContactData = {
    name: BUSINESS_NAME,
    phone: BUSINESS_PHONE,
    whatsappUrl: HUMAN_SUPPORT_WHATSAPP_URL,
};
