// Standalone QA test script for M6 checklist logic.
// Run with: npx ts-node --transpile-only src/lib/checklist.qa-test.ts
// (or: node_modules/.bin/ts-node --transpile-only src/lib/checklist.qa-test.ts)
//
// This is a throwaway QA test file, not wired into any test runner.

import { computeNetBalances, simplifyDebts, ExpenseForBalance, ChecklistTransfer } from './checklist';

let passed = 0;
let failed = 0;

function assertEqual(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`PASS: ${msg}`);
  } else {
    failed++;
    console.log(`FAIL: ${msg}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

function assertTrue(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`PASS: ${msg}`);
  } else {
    failed++;
    console.log(`FAIL: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Scenario 1: classic 3-person cross-expense scenario
// ---------------------------------------------------------------------------
{
  const A = 'A', B = 'B', C = 'C';
  const members = [A, B, C];
  const expenses: ExpenseForBalance[] = [
    {
      paidBy: A,
      amountKurus: 3000,
      splits: [
        { userId: A, shareAmountKurus: 1000 },
        { userId: B, shareAmountKurus: 1000 },
        { userId: C, shareAmountKurus: 1000 },
      ],
    },
    {
      paidBy: B,
      amountKurus: 3000,
      splits: [
        { userId: A, shareAmountKurus: 1000 },
        { userId: B, shareAmountKurus: 1000 },
        { userId: C, shareAmountKurus: 1000 },
      ],
    },
  ];

  const balances = computeNetBalances(members, expenses);
  assertEqual(balances.get(A), 1000, 'Scenario1: A net balance = +1000');
  assertEqual(balances.get(B), 1000, 'Scenario1: B net balance = +1000');
  assertEqual(balances.get(C), -2000, 'Scenario1: C net balance = -2000');

  const checklist = simplifyDebts(balances);
  assertEqual(checklist.length, 2, 'Scenario1: exactly 2 transfers');
  assertEqual(
    checklist,
    [
      { from_user: C, to_user: A, amount_kurus: 1000, pending_payment_id: null },
      { from_user: C, to_user: B, amount_kurus: 1000, pending_payment_id: null },
    ],
    'Scenario1: checklist is C->A 1000, C->B 1000 (deterministic tiebreak by userId)',
  );

  const totalTransferred = checklist.reduce((s, t) => s + t.amount_kurus, 0);
  const totalDebt = [...balances.values()].filter((v) => v < 0).reduce((s, v) => s - v, 0);
  assertEqual(totalTransferred, totalDebt, 'Scenario1: total transferred equals total debt');
}

// ---------------------------------------------------------------------------
// Scenario 2: partially-cancelling debts collapse to single transfer
// A owes B 500, B owes A 200 (net: A owes B 300) -> should be ONE transfer line
// ---------------------------------------------------------------------------
{
  const A = 'A', B = 'B';
  const balances = new Map<string, number>([
    [A, -300],
    [B, 300],
  ]);
  const checklist = simplifyDebts(balances);
  assertEqual(checklist.length, 1, 'Scenario2: partially-cancelling debts collapse to 1 transfer');
  assertEqual(
    checklist,
    [{ from_user: A, to_user: B, amount_kurus: 300, pending_payment_id: null }],
    'Scenario2: single transfer A->B 300',
  );
}

// ---------------------------------------------------------------------------
// Scenario 3: all-settled case
// ---------------------------------------------------------------------------
{
  const balances = new Map<string, number>([
    ['A', 0],
    ['B', 0],
    ['C', 0],
  ]);
  const checklist = simplifyDebts(balances);
  assertEqual(checklist, [], 'Scenario3: all-settled -> empty checklist');
}

// ---------------------------------------------------------------------------
// Scenario 4: rounding-remainder split (100 / 3 = 33/33/34, payer gets remainder)
// ---------------------------------------------------------------------------
{
  const A = 'A', B = 'B', C = 'C';
  const members = [A, B, C];
  // A pays 100, split 34/33/33 with A (payer) getting the extra kurus
  const expenses: ExpenseForBalance[] = [
    {
      paidBy: A,
      amountKurus: 100,
      splits: [
        { userId: A, shareAmountKurus: 34 },
        { userId: B, shareAmountKurus: 33 },
        { userId: C, shareAmountKurus: 33 },
      ],
    },
  ];
  const balances = computeNetBalances(members, expenses);
  // A: +100 - 34 = 66 ; B: -33 ; C: -33
  assertEqual(balances.get(A), 66, 'Scenario4: A balance = 66');
  assertEqual(balances.get(B), -33, 'Scenario4: B balance = -33');
  assertEqual(balances.get(C), -33, 'Scenario4: C balance = -33');

  const sum = [...balances.values()].reduce((s, v) => s + v, 0);
  assertEqual(sum, 0, 'Scenario4: balances sum to exactly 0 (integer-exact)');

  const checklist = simplifyDebts(balances);
  const totalTransferred = checklist.reduce((s, t) => s + t.amount_kurus, 0);
  assertEqual(totalTransferred, 66, 'Scenario4: checklist total transferred = 66');
  assertTrue(
    checklist.every((t) => Number.isInteger(t.amount_kurus) && t.amount_kurus > 0),
    'Scenario4: every transfer amount is a positive integer',
  );
}

// ---------------------------------------------------------------------------
// Scenario 5: generic property check across a more complex 5-person balance set
// verify: every transfer positive integer, sum(transfers) == sum(positive balances),
// and min-transfer-count property (<= n-1)
// ---------------------------------------------------------------------------
{
  const balances = new Map<string, number>([
    ['A', 500],
    ['B', -200],
    ['C', 300],
    ['D', -400],
    ['E', -200],
  ]); // sums to 0
  const checklist = simplifyDebts(balances);
  const totalTransferred = checklist.reduce((s, t) => s + t.amount_kurus, 0);
  const totalPositive = [...balances.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0);
  assertEqual(totalTransferred, totalPositive, 'Scenario5: total transferred equals total positive balance');
  assertTrue(checklist.length <= balances.size - 1, 'Scenario5: transfer count <= n-1 (min-transfer property)');
  assertTrue(
    checklist.every((t) => Number.isInteger(t.amount_kurus) && t.amount_kurus > 0),
    'Scenario5: every transfer amount is a positive integer',
  );

  // Verify resulting balances after applying transfers reach zero
  const finalBalances = new Map(balances);
  for (const t of checklist) {
    finalBalances.set(t.from_user, (finalBalances.get(t.from_user) ?? 0) + t.amount_kurus);
    finalBalances.set(t.to_user, (finalBalances.get(t.to_user) ?? 0) - t.amount_kurus);
  }
  assertTrue(
    [...finalBalances.values()].every((v) => v === 0),
    'Scenario5: applying all transfers zeroes out every balance',
  );
}

// ---------------------------------------------------------------------------
// Scenario 6: member with zero activity should not appear in checklist
// ---------------------------------------------------------------------------
{
  const A = 'A', B = 'B', C = 'C';
  const balances = computeNetBalances([A, B, C], [
    {
      paidBy: A,
      amountKurus: 200,
      splits: [
        { userId: A, shareAmountKurus: 100 },
        { userId: B, shareAmountKurus: 100 },
      ],
    },
  ]);
  assertEqual(balances.get(C), 0, 'Scenario6: uninvolved member C balance stays 0');
  const checklist = simplifyDebts(balances);
  assertTrue(
    !checklist.some((t) => t.from_user === C || t.to_user === C),
    'Scenario6: uninvolved member does not appear in checklist',
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
