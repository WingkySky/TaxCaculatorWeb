#!/usr/bin/env python3
# 测试一下个税计算，看看问题所在

BRACKETS = [
    {'upTo': 36000, 'rate': 0.03, 'quick': 0},
    {'upTo': 144000, 'rate': 0.10, 'quick': 2520},
    {'upTo': 300000, 'rate': 0.20, 'quick': 16920},
    {'upTo': 420000, 'rate': 0.25, 'quick': 31920},
    {'upTo': 660000, 'rate': 0.30, 'quick': 52920},
    {'upTo': 960000, 'rate': 0.35, 'quick': 85920},
    {'upTo': float('inf'), 'rate': 0.45, 'quick': 181920},
]

def get_bracket(taxable_income):
    for b in BRACKETS:
        if taxable_income <= b['upTo']:
            return b
    return BRACKETS[-1]

def calc_tax_forward(income, cum_income=0, cum_deduction=5000, cum_tax=0):
    withholding_income = income * 0.8
    new_cum_income = cum_income + withholding_income
    taxable_income = max(0, new_cum_income - cum_deduction)
    bracket = get_bracket(taxable_income)
    cum_tax_due_raw = taxable_income * bracket['rate'] - bracket['quick']
    cum_tax_due = max(0, round(cum_tax_due_raw * 100) / 100)
    current_tax = max(0, round((cum_tax_due - round(cum_tax * 100) / 100) * 100) / 100)
    post_tax = round((income - current_tax) * 100) / 100
    
    return {
        'preTax': income,
        'withholdingIncome': withholding_income,
        'cumIncome': new_cum_income,
        'cumDeduction': cum_deduction,
        'taxableIncome': taxable_income,
        'rate': bracket['rate'],
        'quick': bracket['quick'],
        'cumTaxDue': cum_tax_due,
        'currentTax': current_tax,
        'postTax': post_tax,
    }

print("=== 测试 2026 年的数据（从1月开始）===")

# 数据从 2026 年开始：
test_data = [
    ('2026-01', 7633.20, 33.20),
    ('2026-02', 7633.20, 33.19),
    ('2026-02', 500.00, 12.00),
    ('2026-03', 7633.20, 33.20),
    ('2026-04', 7633.20, 33.20),
    ('2026-04', 7633.20, 183.19),
]

cum_income = 0
cum_tax = 0
cum_deduction = 0
last_month = ''

for month, income, expected_tax in test_data:
    print(f"\n--- 月份: {month}, 收入: {income} ---")
    
    if month != last_month:
        last_month = month
        cum_deduction += 5000
        print(f"  增加减除费用: cum_deduction = {cum_deduction}")
        
    result = calc_tax_forward(income, cum_income, cum_deduction, cum_tax)
    print(f"  计算结果:")
    print(f"    预扣收入额: {result['withholdingIncome']}")
    print(f"    累计收入: {result['cumIncome']}")
    print(f"    应纳税所得额: {result['taxableIncome']}")
    print(f"    税率: {result['rate']}")
    print(f"    速算扣除: {result['quick']}")
    print(f"    累计应纳税: {result['cumTaxDue']}")
    print(f"    本期个税: {result['currentTax']}")
    print(f"    期望个税: {expected_tax}")
    print(f"    差异: {round((result['currentTax'] - expected_tax)*100)/100}")
    
    cum_income = result['cumIncome']
    cum_tax = result['cumTaxDue']
