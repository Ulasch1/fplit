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
// Scenario 1: classic 3-person cross-expense scenario (live split, same members)
// ---------------------------------------------------------------------------
{
  const A = 'A', B = 'B', C = 'C';
  const members = [A, B, C];
  const expenses: ExpenseForBalance[] = [
    { paidBy: A, amountKurus: 3000 },
    { paidBy: B, amountKurus: 3000 },
  ];

  const balances = computeNetBalances(members, expenses);
  // Each expense split equally: 1000/1000/1000 (no remainder). A and B each +3000-1000=+2000? Wait recalc:
  // For A's expense: A +3000 (paid), shares A-1000, B-1000, C-1000 => A +2000. For B's expense: B +3000 (paid), shares A-1000, B-1000, C-1000 => B +2000, A -1000. Net: A +2000-1000=+1000, B +2000-1000=+1000, C -2000.
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
// Live model computes same values
// ---------------------------------------------------------------------------
{
  const A = 'A', B = 'B', C = 'C';
  const members = [A, B, C];
  const expenses: ExpenseForBalance[] = [
    { paidBy: A, amountKurus: 100 },
  ];
  const balances = computeNetBalances(members, expenses);
  // base = 33, remainder 1 goes to payer A => shares: A 34, B 33, C 33.
  // A: +100 -34 = 66; B: -33; C: -33
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
// Scenario 6: LATE-JOINING member retroactively shares a pre-existing expense
// (new behaviour: splits are computed against the CURRENT member list, not historic)
// ---------------------------------------------------------------------------
{
  const A = 'A', B = 'B', C = 'C';  // C joined after the expense was created
  const members = [A, B, C];
  const expenses: ExpenseForBalance[] = [
    { paidBy: A, amountKurus: 30 },
  ];

  const balances = computeNetBalances(members, expenses);
  // 30 split evenly across 3 -> 10 each, no remainder
  // A: +30 -10 = +20
  // B: -10
  // C: -10
  assertEqual(balances.get(A), 20, 'Scenario6: A (payer) = +20');
  assertEqual(balances.get(B), -10, 'Scenario6: B = -10 (late joiner shares expense)');
  assertEqual(balances.get(C), -10, 'Scenario6: C = -10 (late joiner shares expense)');

  const checklist = simplifyDebts(balances);
  const totalTransferred = checklist.reduce((s, t) => s + t.amount_kurus, 0);
  assertEqual(totalTransferred, 20, 'Scenario6: total transferred = 20');
  assertTrue(
    checklist.some((t) => t.from_user === B || t.from_user === C),
    'Scenario6: B and/or C appear as debtors',
  );
}

// ---------------------------------------------------------------------------
// Scenario 7: rounding remainder still goes to the payer under live model
// e.g. members [A,B,C], expense paidBy B amountKurus 100
// ---------------------------------------------------------------------------
{
  const A = 'A', B = 'B', C = 'C';
  const members = [A, B, C];
  const expenses: ExpenseForBalance[] = [
    { paidBy: B, amountKurus: 100 },
  ];

  const balances = computeNetBalances(members, expenses);
  // base = 33, remainder 1 goes to payer B -> shares: A 33, B 34, C 33
  // B: +100 -34 = +66; A: -33; C: -33
  assertEqual(balances.get(A), -33, 'Scenario7: A = -33');
  assertEqual(balances.get(B), 66, 'Scenario7: B (payer) = +66');
  assertEqual(balances.get(C), -33, 'Scenario7: C = -33');
}

// ---------------------------------------------------------------------------
// Scenario 8 (M7 regression): a CONFIRMED payment must SETTLE debt, not double it.
// A owes B 5000 (single expense: B pays 10000 split 5000/5000). A pays B 5000
// and it gets CONFIRMED -> balances must be exactly 0/0 and checklist empty.
// ---------------------------------------------------------------------------
{
  const A = 'A', B = 'B';
  const members = [A, B];
  const expenses: ExpenseForBalance[] = [
    { paidBy: B, amountKurus: 10000 },
  ];

  const balancesBefore = computeNetBalances(members, expenses);
  assertEqual(balancesBefore.get(A), -5000, 'Scenario8: before payment, A balance = -5000');
  assertEqual(balancesBefore.get(B), 5000, 'Scenario8: before payment, B balance = +5000');

  const balancesAfter = computeNetBalances(members, expenses, [
    { fromUser: A, toUser: B, amountKurus: 5000 },
  ]);
  assertEqual(balancesAfter.get(A), 0, 'Scenario8 (regression): after CONFIRMED payment, A balance = 0 (not -10000)');
  assertEqual(balancesAfter.get(B), 0, 'Scenario8 (regression): after CONFIRMED payment, B balance = 0 (not +10000)');

  const checklistAfter = simplifyDebts(balancesAfter);
  assertEqual(checklistAfter, [], 'Scenario8 (regression): checklist is EMPTY after fully-settling confirmed payment');
}

// ---------------------------------------------------------------------------
// Scenario 9 (M7 regression): partial settlement across a multi-debt group.
// C is owed 3000 by both A and B. A settles fully; B's debt must remain untouched.
// ---------------------------------------------------------------------------
{
  const A = 'A', B = 'B', C = 'C';
  const members = [A, B, C];
  const expenses: ExpenseForBalance[] = [
    { paidBy: C, amountKurus: 9000 },
  ];

  // Only A's payment confirmed so far
  const balancesPartial = computeNetBalances(members, expenses, [
    { fromUser: A, toUser: C, amountKurus: 3000 },
  ]);
  assertEqual(balancesPartial.get(A), 0, 'Scenario9: after A settles, A balance = 0');
  assertEqual(balancesPartial.get(B), -3000, 'Scenario9: B balance still -3000 (untouched)');
  assertEqual(balancesPartial.get(C), 3000, 'Scenario9: C balance still +3000 (not yet fully settled)');
  const checklistPartial = simplifyDebts(balancesPartial);
  assertEqual(
    checklistPartial,
    [{ from_user: B, to_user: C, amount_kurus: 3000, pending_payment_id: null }],
    'Scenario9: checklist shows only remaining B->C 3000 debt',
  );

  // Both A and B's payments confirmed
  const balancesFull = computeNetBalances(members, expenses, [
    { fromUser: A, toUser: C, amountKurus: 3000 },
    { fromUser: B, toUser: C, amountKurus: 3000 },
  ]);
  assertEqual(balancesFull.get(A), 0, 'Scenario9: after both settle, A balance = 0');
  assertEqual(balancesFull.get(B), 0, 'Scenario9: after both settle, B balance = 0');
  assertEqual(balancesFull.get(C), 0, 'Scenario9: after both settle, C balance = 0');
  const checklistFull = simplifyDebts(balancesFull);
  assertEqual(checklistFull, [], 'Scenario9 (regression): checklist EMPTY once all debts confirmed-settled');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
