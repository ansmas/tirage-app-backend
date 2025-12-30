export function generateSessionCode(): string {
     return Math.random().toString(36).substring(2, 7).toUpperCase();
}