// src/lib/signature.ts
// Utility for HashKey Merchant HMAC-SHA256 Signature Generation

/**
 * Generates an HMAC-SHA256 signature, nonce, and timestamp for HashKey integration
 * @param payload - The payload to sign (as string or object)
 * @param secretKey - The institutional merchant secret key
 */
export async function generateHashKeyAuthHeaders(payload: any, secretKey: string = "DEMO_SECRET") {
    const timestamp = Date.now().toString();
    const nonce = Math.random().toString(36).substring(2, 15);
    
    const dataString = typeof payload === 'string' ? payload : JSON.stringify(payload);
    
    // The canonical string for signing, typically: timestamp + nonce + payload
    const canonicalString = `${timestamp}${nonce}${dataString}`;

    // Browser-native Web Crypto HMAC-SHA256
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const msgData = encoder.encode(canonicalString);

    try {
        const key = await crypto.subtle.importKey(
            'raw',
            keyData,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const signatureBuffer = await crypto.subtle.sign('HMAC', key, msgData);
        
        // Convert to hex
        const signatureArray = Array.from(new Uint8Array(signatureBuffer));
        const signatureHex = signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return {
            'X-Signature': signatureHex,
            'X-Timestamp': timestamp,
            'X-Nonce': nonce
        };
    } catch (error) {
        console.warn("Web crypto failed (likely SSR or unsupported environment). Generating mock signature.");
        return {
            'X-Signature': `mock_hmac_${Date.now()}`,
            'X-Timestamp': timestamp,
            'X-Nonce': nonce
        };
    }
}
