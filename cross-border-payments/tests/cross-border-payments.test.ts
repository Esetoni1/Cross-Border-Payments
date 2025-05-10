import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  Client, 
  Provider, 
  ProviderRegistry, 
  Result,
  Receipt,
} from '@blockstack/clarity';

// Mock the contract path - adjust as needed for your project structure
const CONTRACT_PATH = './contracts/cross-border-payment.clar';
const CONTRACT_NAME = 'cross-border-payment';

describe('Cross-Border Payment System Contract Tests', () => {
  let provider: Provider;
  let client: Client;
  const accounts = {
    deployer: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM', // Contract owner
    user1: 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG',    // Sender
    user2: 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC'     // Recipient
  };

  beforeEach(async () => {
    provider = await ProviderRegistry.createProvider();
    client = new Client(CONTRACT_NAME, CONTRACT_PATH, provider);
    
    // Deploy the contract
    await client.deployContract();
  });

  describe('Administrative Functions', () => {
    it('allows owner to add supported currencies', async () => {
      // Add USD as a supported currency with 2 decimals
      const txResult = await client.submitTransaction({
        method: { name: 'add-supported-currency', args: ['USD', '2'] },
        senderAddress: accounts.deployer
      });
      
      expect(txResult.success).toBeTruthy();
      
      // Verify the currency was added
      const checkResult = await client.callReadOnlyFn(
        'check-currency-support',
        ['USD'],
        accounts.deployer
      );
      
      const resultValue = Result.unwrapOk(checkResult);
      expect(resultValue).toStrictEqual({ supported: true, decimals: 2 });
    });
    
    it('prevents non-owner from adding supported currencies', async () => {
      const txResult = await client.submitTransaction({
        method: { name: 'add-supported-currency', args: ['EUR', '2'] },
        senderAddress: accounts.user1 // Not the owner
      });
      
      expect(txResult.success).toBeFalsy();
      expect(txResult.error).toContain('err-owner-only');
    });
    
    it('allows owner to add supported countries', async () => {
      const txResult = await client.submitTransaction({
        method: { name: 'add-supported-country', args: ['US'] },
        senderAddress: accounts.deployer
      });
      
      expect(txResult.success).toBeTruthy();
      
      // Verify the country was added
      const checkResult = await client.callReadOnlyFn(
        'check-country-support',
        ['US'],
        accounts.deployer
      );
      
      const resultValue = Result.unwrapOk(checkResult);
      expect(resultValue).toStrictEqual({ supported: true });
    });
    
    it('allows owner to set exchange rates', async () => {
      // First add the currencies
      await client.submitTransaction({
        method: { name: 'add-supported-currency', args: ['USD', '2'] },
        senderAddress: accounts.deployer
      });
      
      await client.submitTransaction({
        method: { name: 'add-supported-currency', args: ['EUR', '2'] },
        senderAddress: accounts.deployer
      });
      
      // Set timestamp for testing
      await client.submitTransaction({
        method: { name: 'update-timestamp', args: ['1620000000'] },
        senderAddress: accounts.deployer
      });
      
      // Set exchange rate: 1 USD = 0.85 EUR (with 2 decimals: 85)
      const txResult = await client.submitTransaction({
        method: { name: 'set-exchange-rate', args: ['USD', 'EUR', '85', '2'] },
        senderAddress: accounts.deployer
      });
      
      expect(txResult.success).toBeTruthy();
      
      // Verify the exchange rate was set
      const rateResult = await client.callReadOnlyFn(
        'get-current-exchange-rate',
        ['USD', 'EUR'],
        accounts.deployer
      );
      
      const rateValue = Result.unwrapOk(rateResult);
      expect(rateValue).toStrictEqual({ 
        rate: 85, 
        decimals: 2,
        'last-updated': 1620000000
      });
    });
    
    it('allows owner to set fee percentage', async () => {
      // Set fee to 3% (300 with 2 decimals of precision)
      const txResult = await client.submitTransaction({
        method: { name: 'set-fee-percentage', args: ['300'] },
        senderAddress: accounts.deployer
      });
      
      expect(txResult.success).toBeTruthy();
      
      // Verify the fee was set
      const feeResult = await client.callReadOnlyFn(
        'get-current-fee-percentage',
        [],
        accounts.deployer
      );
      
      const feeValue = Result.unwrapOk(feeResult);
      expect(feeValue).toBe(300);
    });
  });
  
  describe('User Operations', () => {
    beforeEach(async () => {
      // Set up test environment with required data
      
      // Add supported currencies
      await client.submitTransaction({
        method: { name: 'add-supported-currency', args: ['USD', '2'] },
        senderAddress: accounts.deployer
      });
      
      await client.submitTransaction({
        method: { name: 'add-supported-currency', args: ['EUR', '2'] },
        senderAddress: accounts.deployer
      });
      
      // Add supported countries
      await client.submitTransaction({
        method: { name: 'add-supported-country', args: ['US'] },
        senderAddress: accounts.deployer
      });
      
      await client.submitTransaction({
        method: { name: 'add-supported-country', args: ['FR'] },
        senderAddress: accounts.deployer
      });
      
      // Set exchange rates
      await client.submitTransaction({
        method: { name: 'set-exchange-rate', args: ['USD', 'EUR', '85', '2'] },
        senderAddress: accounts.deployer
      });
      
      await client.submitTransaction({
        method: { name: 'set-exchange-rate', args: ['EUR', 'USD', '118', '2'] },
        senderAddress: accounts.deployer
      });
      
      // Set timestamp
      await client.submitTransaction({
        method: { name: 'update-timestamp', args: ['1620000000'] },
        senderAddress: accounts.deployer
      });
    });
    
    it('allows users to deposit funds', async () => {
      // User1 deposits 1000 USD
      const depositResult = await client.submitTransaction({
        method: { name: 'deposit', args: ['USD', '1000'] },
        senderAddress: accounts.user1
      });
      
      expect(depositResult.success).toBeTruthy();
      
      // Check user balance
      const balanceResult = await client.callReadOnlyFn(
        'get-balance',
        [accounts.user1, 'USD'],
        accounts.user1
      );
      
      const balance = Result.unwrapOk(balanceResult);
      expect(balance).toBe(1000);
    });
    
    it('prevents deposit of invalid amount', async () => {
      // Try to deposit 0 USD
      const depositResult = await client.submitTransaction({
        method: { name: 'deposit', args: ['USD', '0'] },
        senderAddress: accounts.user1
      });
      
      expect(depositResult.success).toBeFalsy();
      expect(depositResult.error).toContain('err-invalid-amount');
    });
    
    it('prevents deposit of unsupported currency', async () => {
      // Try to deposit in an unsupported currency
      const depositResult = await client.submitTransaction({
        method: { name: 'deposit', args: ['GBP', '1000'] },
        senderAddress: accounts.user1
      });
      
      expect(depositResult.success).toBeFalsy();
      expect(depositResult.error).toContain('err-currency-not-supported');
    });
    
    it('executes a successful cross-border payment', async () => {
      // User1 deposits 1000 USD
      await client.submitTransaction({
        method: { name: 'deposit', args: ['USD', '1000'] },
        senderAddress: accounts.user1
      });
      
      // User1 sends 100 USD to User2, converting to EUR
      const paymentResult = await client.submitTransaction({
        method: { 
          name: 'send-payment', 
          args: [
            accounts.user2,  // recipient
            '100',           // amount
            'USD',           // from currency
            'EUR',           // to currency
            'US',            // sender country
            'FR'             // recipient country
          ]
        },
        senderAddress: accounts.user1
      });
      
      expect(paymentResult.success).toBeTruthy();
      
      // Check balances
      // User1 should have 1000 - 100 - fee = 897.50 USD (fee is 2.5% by default)
      const senderBalanceResult = await client.callReadOnlyFn(
        'get-balance',
        [accounts.user1, 'USD'],
        accounts.user1
      );
      
      const senderBalance = Result.unwrapOk(senderBalanceResult);
      // With 2.5% fee on 100, fee is 2.5 so balance should be 897.5
      expect(senderBalance).toBe(897.5);
      
      // User2 should have 85 EUR (100 USD * 0.85 exchange rate)
      const recipientBalanceResult = await client.callReadOnlyFn(
        'get-balance',
        [accounts.user2, 'EUR'],
        accounts.user2
      );
      
      const recipientBalance = Result.unwrapOk(recipientBalanceResult);
      expect(recipientBalance).toBe(85);
      
      // Check transaction record
      const txId = Result.unwrapOk(paymentResult);
      const txRecordResult = await client.callReadOnlyFn(
        'get-transaction',
        [txId],
        accounts.deployer
      );
      
      const txRecord = Result.unwrapOk(txRecordResult);
      expect(txRecord.sender).toBe(accounts.user1);
      expect(txRecord.recipient).toBe(accounts.user2);
      expect(txRecord.amount).toBe(100);
      expect(txRecord['from-currency']).toBe('USD');
      expect(txRecord['to-currency']).toBe('EUR');
      expect(txRecord.status).toBe('completed');
    });
    
    it('prevents payment with insufficient balance', async () => {
      // User1 deposits 50 USD
      await client.submitTransaction({
        method: { name: 'deposit', args: ['USD', '50'] },
        senderAddress: accounts.user1
      });
      
      // Try to send 100 USD (more than balance)
      const paymentResult = await client.submitTransaction({
        method: { 
          name: 'send-payment', 
          args: [
            accounts.user2, 'USD', 'EUR', '100', 'US', 'FR'
          ]
        },
        senderAddress: accounts.user1
      });
      
      expect(paymentResult.success).toBeFalsy();
      expect(paymentResult.error).toContain('err-insufficient-balance');
    });
    
    it('prevents payment to unsupported country', async () => {
      // User1 deposits 100 USD
      await client.submitTransaction({
        method: { name: 'deposit', args: ['USD', '100'] },
        senderAddress: accounts.user1
      });
      
      // Try to send money to an unsupported country (DE not added)
      const paymentResult = await client.submitTransaction({
        method: { 
          name: 'send-payment', 
          args: [
            accounts.user2, '50', 'USD', 'EUR', 'US', 'DE'
          ]
        },
        senderAddress: accounts.user1
      });
      
      expect(paymentResult.success).toBeFalsy();
      expect(paymentResult.error).toContain('err-compliance-check-failed');
    });
    
    it('prevents payment in unsupported currency', async () => {
      // User1 deposits 100 USD
      await client.submitTransaction({
        method: { name: 'deposit', args: ['USD', '100'] },
        senderAddress: accounts.user1
      });
      
      // Try to send money to an unsupported currency (GBP not added)
      const paymentResult = await client.submitTransaction({
        method: { 
          name: 'send-payment', 
          args: [
            accounts.user2, '50', 'USD', 'GBP', 'US', 'FR'
          ]
        },
        senderAddress: accounts.user1
      });
      
      expect(paymentResult.success).toBeFalsy();
      expect(paymentResult.error).toContain('err-compliance-check-failed');
    });
    
    it('prevents payment when exchange rate is not available', async () => {
      // Add a new currency without setting exchange rate
      await client.submitTransaction({
        method: { name: 'add-supported-currency', args: ['JPY', '2'] },
        senderAddress: accounts.deployer
      });
      
      // User1 deposits 100 USD
      await client.submitTransaction({
        method: { name: 'deposit', args: ['USD', '100'] },
        senderAddress: accounts.user1
      });
      
      // Try to send money to a currency without exchange rate
      const paymentResult = await client.submitTransaction({
        method: { 
          name: 'send-payment', 
          args: [
            accounts.user2, '50', 'USD', 'JPY', 'US', 'FR'
          ]
        },
        senderAddress: accounts.user1
      });
      
      expect(paymentResult.success).toBeFalsy();
      expect(paymentResult.error).toContain('err-exchange-rate-unavailable');
    });
  });
  
  describe('Read-only functions', () => {
    beforeEach(async () => {
      // Setup test data
      await client.submitTransaction({
        method: { name: 'add-supported-currency', args: ['USD', '2'] },
        senderAddress: accounts.deployer
      });
      
      await client.submitTransaction({
        method: { name: 'add-supported-country', args: ['US'] },
        senderAddress: accounts.deployer
      });
    });
    
    it('correctly reports currency support', async () => {
      // Check supported currency
      const supportedResult = await client.callReadOnlyFn(
        'check-currency-support',
        ['USD'],
        accounts.user1
      );
      
      const supportedValue = Result.unwrapOk(supportedResult);
      expect(supportedValue).toStrictEqual({ supported: true, decimals: 2 });
      
      // Check unsupported currency
      const unsupportedResult = await client.callReadOnlyFn(
        'check-currency-support',
        ['GBP'],
        accounts.user1
      );
      
      expect(Result.isOk(unsupportedResult)).toBeFalsy();
    });
    
    it('correctly reports country support', async () => {
      // Check supported country
      const supportedResult = await client.callReadOnlyFn(
        'check-country-support',
        ['US'],
        accounts.user1
      );
      
      const supportedValue = Result.unwrapOk(supportedResult);
      expect(supportedValue).toStrictEqual({ supported: true });
      
      // Check unsupported country
      const unsupportedResult = await client.callReadOnlyFn(
        'check-country-support',
        ['DE'],
        accounts.user1
      );
      
      expect(Result.isOk(unsupportedResult)).toBeFalsy();
    });
    
    it('reports user balances correctly', async () => {
      // User has no balance initially
      const initialBalanceResult = await client.callReadOnlyFn(
        'get-balance',
        [accounts.user1, 'USD'],
        accounts.user1
      );
      
      const initialBalance = Result.unwrapOk(initialBalanceResult);
      expect(initialBalance).toBe(0);
      
      // User deposits funds
      await client.submitTransaction({
        method: { name: 'deposit', args: ['USD', '500'] },
        senderAddress: accounts.user1
      });
      
      // Check updated balance
      const updatedBalanceResult = await client.callReadOnlyFn(
        'get-balance',
        [accounts.user1, 'USD'],
        accounts.user1
      );
      
      const updatedBalance = Result.unwrapOk(updatedBalanceResult);
      expect(updatedBalance).toBe(500);
    });
  });
});