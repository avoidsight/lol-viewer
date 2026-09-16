import { z } from 'zod';
export const donationConfigSchema = z.object({ enabled: z.boolean(), revision: z.number().int().positive() }).strict();
export type DonationConfig = z.infer<typeof donationConfigSchema>;
export const donationImageSchema = z.string().max(2800000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/).nullable();
export const DONATION_CONFIG_CHANNEL = 'donation:config';
export const DONATION_IMAGE_CHANNEL = 'donation:image';
