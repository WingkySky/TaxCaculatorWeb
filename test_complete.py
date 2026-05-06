#!/usr/bin/env python3
# 测试完整的历史数据

import xlrd

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

# 读取完整数据
wb = xlrd.open_workbook('发放明细.xls')
ws = wb.sheet_by_index(0)
headers = ws.row_values(2)

data = []
for row_idx in range(3, ws.nrows):
    row = ws.row_values(row_idx)
    if len(row) < len(headers):
        row += [''] * (len(headers) - len(row))
    
    record = dict(zip(headers, row))
    if record['状态'] == '已打款':
        # 提取月份
        time_str = record['创建时间'] or record['更新时间']
        if time_str:
            date_part = time_str.split()[0]
            if '-' in date_part:
                y, m, d = date_part.split('-')[:3]
                record['月份'] = f"{y}-{m.zfill(2)}"
                data.append(record)

print(f"已加载 {len(data)} 条记录")

# 按月份和创建时间排序
data_sorted = sorted(data, key=lambda r: (r['月份'], r['创建时间']))

print("\n=== 计算过程 ===")
cum_income = 0
cum_tax = 0
cum_deduction = 0
last_month = ''
last_year = ''

for r in data_sorted:
    month = r['月份']
    income = float(r['税前金额']) if r['税前金额'] else 0
    expected_tax = float(r['个税金额']) if r['个税金额'] else 0
    
    # 跨年重置
    cur_year = month.split('-')[0]
    if cur_year != last_year:
        if last_year:
            cum_income = 0
            cum_tax = 0
            cum_deduction = 0
            last_month = ''
        last_year = cur_year
    
    # 同月只扣一次减除费用
    if month != last_month:
        last_month = month
        cum_deduction += 5000
    
    result = calc_tax_forward(income, cum_income, cum_deduction, cum_tax)
    
    # 打印结果
    diff = result['currentTax'] - expected_tax
    status = '✓' if abs(diff) < 0.01 else '✗'
    
    print(f"{status} {month}: {income} → 我们算的: {result['currentTax']}, 平台算的: {expected_tax} (差: {diff:.2f}) | 累计收入: {result['cumIncome']}, 累计减除: {result['cumDeduction']}")
    
    cum_income = result['cumIncome']
    cum_tax = result['cumTaxDue']
