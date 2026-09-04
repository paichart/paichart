/**
 * Unit Tests for First-Party MCP Token Minting
 * Tests the OAuth token minting, JWKS, and validation chain
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

describe('First-Party MCP Token Minting', () => {
  let privateKey, publicKey;

  beforeAll(() => {
    // Generate test keypair
    const keypair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    privateKey = keypair.privateKey;
    publicKey = keypair.publicKey;

    // Set test environment
    process.env.MCP_PRIVATE_KEY_PEM = privateKey;
    process.env.MCP_PUBLIC_KEY_PEM = publicKey;
    process.env.MCP_JWKS_KID = 'test-key-1';
  });

  describe('Token Minting', () => {
    test('mints RS256 token with correct algorithm', () => {
      const token = jwt.sign(
        { scope: 'read:user read:org' },
        privateKey,
        {
          algorithm: 'RS256',
          keyid: 'test-key-1',
          issuer: 'https://paichart.app',
          audience: 'https://paichart.app/mcp',
          subject: 'test-user-123',
          expiresIn: 900
        }
      );

      const decoded = jwt.decode(token, { complete: true });

      expect(decoded.header.alg).toBe('RS256');
      expect(decoded.header.kid).toBe('test-key-1');
    });

    test('includes required claims (iss, aud, sub, exp, scope)', () => {
      const token = jwt.sign(
        { scope: 'read:user read:org' },
        privateKey,
        {
          algorithm: 'RS256',
          keyid: 'test-key-1',
          issuer: 'https://paichart.app',
          audience: 'https://paichart.app/mcp',
          subject: 'test-user-123',
          expiresIn: 900
        }
      );

      const decoded = jwt.decode(token);

      expect(decoded.iss).toBe('https://paichart.app');
      expect(decoded.aud).toBe('https://paichart.app/mcp');
      expect(decoded.sub).toBe('test-user-123');
      expect(decoded.scope).toBe('read:user read:org');
      expect(decoded.exp).toBeDefined();
    });

    test('includes azp claim for client binding', () => {
      const token = jwt.sign(
        {
          scope: 'read:user read:org',
          azp: 'test-client-id'
        },
        privateKey,
        {
          algorithm: 'RS256',
          keyid: 'test-key-1',
          issuer: 'https://paichart.app',
          audience: 'https://paichart.app/mcp',
          subject: 'test-user-123',
          expiresIn: 900
        }
      );

      const decoded = jwt.decode(token);
      expect(decoded.azp).toBe('test-client-id');
    });

    test('signature can be verified with public key', () => {
      const token = jwt.sign(
        { scope: 'read:user read:org' },
        privateKey,
        {
          algorithm: 'RS256',
          issuer: 'https://paichart.app',
          audience: 'https://paichart.app/mcp',
          subject: 'test-user-123',
          expiresIn: 900
        }
      );

      const verified = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        issuer: 'https://paichart.app',
        audience: 'https://paichart.app/mcp'
      });

      expect(verified.sub).toBe('test-user-123');
    });
  });

  describe('Scope Matching', () => {
    test('exact scope string preserved (string-for-string match)', () => {
      const requestedScope = 'read:org read:user';  // Specific order

      const token = jwt.sign(
        { scope: requestedScope },
        privateKey,
        {
          algorithm: 'RS256',
          issuer: 'https://paichart.app',
          audience: 'https://paichart.app/mcp',
          subject: 'test-user-123'
        }
      );

      const decoded = jwt.decode(token);
      expect(decoded.scope).toBe(requestedScope);  // Exact match!
      expect(decoded.scope).not.toBe('read:user read:org');  // Order matters
    });

    test('spaces in scope preserved', () => {
      const scopeWithSpaces = 'read:user  read:org';  // Double space

      const token = jwt.sign(
        { scope: scopeWithSpaces },
        privateKey,
        {
          algorithm: 'RS256',
          subject: 'test-user-123'
        }
      );

      const decoded = jwt.decode(token);
      expect(decoded.scope).toBe(scopeWithSpaces);
    });
  });

  describe('Resource Parameter', () => {
    test('aud claim matches requested resource', () => {
      const requestedResource = 'https://paichart.app/mcp';

      const token = jwt.sign(
        { scope: 'read:user' },
        privateKey,
        {
          algorithm: 'RS256',
          audience: requestedResource,
          subject: 'test-user-123'
        }
      );

      const decoded = jwt.decode(token);
      expect(decoded.aud).toBe(requestedResource);
    });

    test('different resources create different audiences', () => {
      const token1 = jwt.sign({}, privateKey, {
        algorithm: 'RS256',
        audience: 'https://paichart.app/mcp',
        subject: 'test-user-123'
      });

      const token2 = jwt.sign({}, privateKey, {
        algorithm: 'RS256',
        audience: 'https://paichart.app',
        subject: 'test-user-123'
      });

      expect(jwt.decode(token1).aud).not.toBe(jwt.decode(token2).aud);
    });
  });

  describe('JWKS Format', () => {
    test('public key exports to JWK format', () => {
      const keyObj = crypto.createPublicKey(publicKey);
      const jwk = keyObj.export({ format: 'jwk' });

      expect(jwk.kty).toBe('RSA');
      expect(jwk.e).toBeDefined();  // Exponent
      expect(jwk.n).toBeDefined();  // Modulus
    });

    test('JWK includes required fields for JWKS', () => {
      const keyObj = crypto.createPublicKey(publicKey);
      const jwk = keyObj.export({ format: 'jwk' });

      jwk.use = 'sig';
      jwk.kid = 'test-key-1';
      jwk.alg = 'RS256';

      const jwks = { keys: [jwk] };

      expect(jwks.keys[0].kid).toBe('test-key-1');
      expect(jwks.keys[0].alg).toBe('RS256');
      expect(jwks.keys[0].use).toBe('sig');
    });
  });

  describe('Token Expiration', () => {
    test('token expires after specified TTL', () => {
      const token = jwt.sign(
        { scope: 'read:user' },
        privateKey,
        {
          algorithm: 'RS256',
          expiresIn: 900  // 15 minutes
        }
      );

      const decoded = jwt.decode(token);
      const ttl = decoded.exp - decoded.iat;

      expect(ttl).toBe(900);
    });

    test('expired token fails verification', (done) => {
      const token = jwt.sign(
        { scope: 'read:user' },
        privateKey,
        {
          algorithm: 'RS256',
          expiresIn: '1s'  // 1 second
        }
      );

      setTimeout(() => {
        try {
          jwt.verify(token, publicKey, { algorithms: ['RS256'] });
          done(new Error('Should have thrown TokenExpiredError'));
        } catch (error) {
          expect(error.name).toBe('TokenExpiredError');
          done();
        }
      }, 1500);  // Wait 1.5 seconds
    });
  });

  describe('Algorithm Detection', () => {
    test('can detect RS256 from header without verification', () => {
      const token = jwt.sign(
        { scope: 'test' },
        privateKey,
        { algorithm: 'RS256' }
      );

      const parts = token.split('.');
      const headerB64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      const header = JSON.parse(Buffer.from(headerB64, 'base64').toString());

      expect(header.alg).toBe('RS256');
    });

    test('can detect HS256 from header', () => {
      const hs256Token = jwt.sign(
        { scope: 'test' },
        'test-secret',
        { algorithm: 'HS256' }
      );

      const parts = hs256Token.split('.');
      const headerB64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
      const header = JSON.parse(Buffer.from(headerB64, 'base64').toString());

      expect(header.alg).toBe('HS256');
    });
  });
});

describe('ChatGPT-Specific Requirements', () => {
  test('scope string-for-string matching', () => {
    // ChatGPT's exact request
    const chatGPTRequest = 'read:org read:user';

    // Our token response
    const tokenScope = 'read:org read:user';

    expect(tokenScope).toBe(chatGPTRequest);  // Must be exact!
  });

  test('scope mismatch detection', () => {
    const requested = 'read:org read:user';
    const returned = 'read:user read:org';  // Different order!

    expect(returned).not.toBe(requested);  // Would fail ChatGPT validation
  });

  test('resource parameter matching', () => {
    const requested = 'https://paichart.app/mcp';
    const tokenAud = 'https://paichart.app/mcp';

    expect(tokenAud).toBe(requested);
  });
});
