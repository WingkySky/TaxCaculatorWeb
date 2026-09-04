/* ============================================================
 * 城市社保公积金政策库 · 初始化数据脚本
 * ------------------------------------------------------------
 * 使用方法：与 tax-calculator.html 放在同一目录即可自动加载
 * （纯本地 file:// 打开时 <script src> 同目录文件不受跨域限制）。
 *
 * 维护方式（任选）：
 *   1. 直接编辑本文件后刷新页面；
 *   2. 页面「政策数据管理」弹层中编辑，并可导出 Excel / JSON；
 *   3. 用 Excel 按导出的表头格式维护后导入覆盖。
 *
 * 结构：城市key → 年度key → 险种（养老/医疗/失业/公积金）
 *   每个险种：{ personal 个人比例(小数), lower 基数下限, upper 基数上限 }
 *   公积金额外：rates 可选比例档（小数数组）；缺省上下限填 null 表示不限。
 *   年度记录：label 说明、effective 生效月区间 [起, 止]（YYYY-MM 闭区间）、
 *            pending: true 表示数值待核对（编辑后请移除该标记）。
 *
 * 数据说明（更新于 2026-09-04）：
 *   · 北京/上海/广州/深圳/杭州/江苏/重庆等 2026 年度数据按公开报道整理；
 *   · 广东最低工资自 2026-09-01 调整（粤府函〔2026〕188号：广州 2680、深圳 2700），
 *     广州公积金下限同步调为 2680；深圳失业保险下限（按最低工资）调为 2700/48471，
 *     深圳公积金下限 2700 同步生效；
 *   · 广东省（广州/深圳）2026 社保年度惯例 10 月前后公布，当前数值为
 *     沿用 2025 年度的过渡值，公布后请更新；
 *   · 深圳医保按自然年公布（2026 年 6727/33633）；
 *   · 武汉、天津 2026 年度暂未检索到官方数字，沿用旧参考值（待核对）。
 *   · 所有数据请以当地社保部门公布为准。
 * ============================================================ */

window.CITY_POLICY_LIBRARY_DATA = {
  beijing: {
    name: '北京',
    years: {
      '2025': {
        label: '2025年度（2025-07 ~ 2026-06）',
        effective: ['2025-07', '2026-06'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 6821, upper: 35283 },
          medical:      { personal: 0.02,  lower: 6821, upper: 35283 },
          unemployment: { personal: 0.005, lower: 6821, upper: 35283 },
          fund:         { personal: 0.12, rates: [0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.12], lower: 2420, upper: 35283 }
        }
      },
      '2026': {
        label: '2026年度（2026-07 ~ 2027-06）',
        effective: ['2026-07', '2027-06'],
        pending: false,
        items: {
          pension:      { personal: 0.08,  lower: 7270, upper: 36348 },
          medical:      { personal: 0.02,  lower: 7270, upper: 36348 },
          unemployment: { personal: 0.005, lower: 7270, upper: 36348 },
          fund:         { personal: 0.12, rates: [0.05, 0.06, 0.07, 0.08, 0.09, 0.10, 0.12], lower: 2420, upper: 36348 }
        }
      }
    }
  },
  shanghai: {
    name: '上海',
    years: {
      '2025': {
        label: '2025年度（2025-07 ~ 2026-06）',
        effective: ['2025-07', '2026-06'],
        pending: false,
        items: {
          pension:      { personal: 0.08,  lower: 7460, upper: 37302 },
          medical:      { personal: 0.02,  lower: 7460, upper: 37302 },
          unemployment: { personal: 0.005, lower: 7460, upper: 37302 },
          fund:         { personal: 0.07, rates: [0.05, 0.06, 0.07, 0.08, 0.10, 0.12], lower: 2740, upper: 37302 }
        }
      },
      '2026': {
        label: '2026年度（2026-07 ~ 2027-06）',
        effective: ['2026-07', '2027-06'],
        pending: false,
        items: {
          pension:      { personal: 0.08,  lower: 7546, upper: 37731 },
          medical:      { personal: 0.02,  lower: 7546, upper: 37731 },
          unemployment: { personal: 0.005, lower: 7546, upper: 37731 },
          fund:         { personal: 0.07, rates: [0.05, 0.06, 0.07, 0.08, 0.10, 0.12], lower: 2740, upper: 37302 }
        }
      }
    }
  },
  guangzhou: {
    name: '广州',
    years: {
      '2023': {
        label: '2023年度（2023-07 ~ 2024-06）',
        effective: ['2023-07', '2024-06'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4546, upper: 26421 },
          medical:      { personal: 0.02,  lower: 7175, upper: 35875 },
          unemployment: { personal: 0.002, lower: 2300, upper: 39579 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2300, upper: 38082 }
        }
      },
      '2024': {
        label: '2024年度（2024-07 ~ 2025-06，医保按自然年为6236/31179；失业下限2025-03起2500）',
        effective: ['2024-07', '2025-06'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 5500, upper: 27501 },
          medical:      { personal: 0.02,  lower: 6236, upper: 31179 },
          unemployment: { personal: 0.002, lower: 2300, upper: 39579 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2300, upper: 38082 }
        }
      },
      '2025': {
        label: '2025年度（2025-07 ~ 2026-06；医保按自然年2025为6236/31179）',
        effective: ['2025-07', '2026-06'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 5510, upper: 27549 },
          medical:      { personal: 0.02,  lower: 6236, upper: 31179 },
          unemployment: { personal: 0.002, lower: 2500, upper: 41112 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2500, upper: 39828 }
        }
      },
      '2026': {
        label: '2026年度（2026-07 ~ 2027-06，社保沿用2025年度；失业/公积金下限2680自2026-09-01随最低工资）',
        effective: ['2026-07', '2027-06'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 5510, upper: 27549 },
          medical:      { personal: 0.02,  lower: 6236, upper: 31179 },
          unemployment: { personal: 0.002, lower: 2680, upper: 41112 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2680, upper: 41697 }
        }
      }
    }
  },
  shenzhen: {
    name: '深圳',
    years: {
      '2025': {
        label: '2025年度（2025-07 ~ 2026-06；医保按自然年，2026-01起为6727/33633，2025下半年为6922/34612待核对）',
        effective: ['2025-07', '2026-06'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4775, upper: 27549 },
          medical:      { personal: 0.02,  lower: 6727, upper: 33633 },
          unemployment: { personal: 0.003, lower: 2520, upper: 44265 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2360, upper: 44265 }
        }
      },
      '2026': {
        label: '2026年度（养老/失业沿用省口径；失业与公积金下限2700自2026-09-01随最低工资，公积金上限沿用待核对）',
        effective: ['2026-07', '2027-06'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4775, upper: 27549 },
          medical:      { personal: 0.02,  lower: 6727, upper: 33633 },
          unemployment: { personal: 0.003, lower: 2700, upper: 48471 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2700, upper: 44265 }
        }
      }
    }
  },
  hangzhou: {
    name: '杭州',
    years: {
      '2025': {
        label: '2025年度（2025-01 ~ 2025-12）',
        effective: ['2025-01', '2025-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4812, upper: 24930 },
          medical:      { personal: 0.02,  lower: 4812, upper: 24930 },
          unemployment: { personal: 0.005, lower: 4812, upper: 24930 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2490, upper: 28695 }
        }
      },
      '2026': {
        label: '2026年度（2026-01 ~ 2026-12，下限4986按浙人社发〔2025〕52号）',
        effective: ['2026-01', '2026-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4986, upper: 24930 },
          medical:      { personal: 0.02,  lower: 4986, upper: 24930 },
          unemployment: { personal: 0.005, lower: 4986, upper: 24930 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2660, upper: 28695 }
        }
      }
    }
  },
  nanjing: {
    name: '南京',
    years: {
      '2025': {
        label: '2025年度（2025-01 ~ 2025-12）',
        effective: ['2025-01', '2025-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4952, upper: 24762 },
          medical:      { personal: 0.02,  lower: 4952, upper: 24762 },
          unemployment: { personal: 0.005, lower: 4952, upper: 24762 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2490, upper: 27600 }
        }
      },
      '2026': {
        label: '2026年度（2026-01 ~ 2026-12，暂按2025年度标准执行）',
        effective: ['2026-01', '2026-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4952, upper: 24762 },
          medical:      { personal: 0.02,  lower: 4952, upper: 24762 },
          unemployment: { personal: 0.005, lower: 4952, upper: 24762 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2490, upper: 27600 }
        }
      }
    }
  },
  suzhou: {
    name: '苏州',
    years: {
      '2025': {
        label: '2025年度（2025-01 ~ 2025-12）',
        effective: ['2025-01', '2025-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4952, upper: 24762 },
          medical:      { personal: 0.02,  lower: 4952, upper: 24762 },
          unemployment: { personal: 0.005, lower: 4952, upper: 24762 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2490, upper: 24396 }
        }
      },
      '2026': {
        label: '2026年度（2026-01 ~ 2026-12，暂按2025年度标准执行）',
        effective: ['2026-01', '2026-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4952, upper: 24762 },
          medical:      { personal: 0.02,  lower: 4952, upper: 24762 },
          unemployment: { personal: 0.005, lower: 4952, upper: 24762 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2490, upper: 24396 }
        }
      }
    }
  },
  chengdu: {
    name: '成都',
    years: {
      '2025': {
        label: '2025年度（2025-01 ~ 2025-12）',
        effective: ['2025-01', '2025-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4511, upper: 22555 },
          medical:      { personal: 0.02,  lower: 4511, upper: 22555 },
          unemployment: { personal: 0.005, lower: 4511, upper: 22555 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2100, upper: 27420 }
        }
      },
      '2026': {
        label: '2026年度（2026-01 ~ 2026-12，社保沿用，公积金按2026新标准）',
        effective: ['2026-01', '2026-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4511, upper: 22555 },
          medical:      { personal: 0.02,  lower: 4511, upper: 22555 },
          unemployment: { personal: 0.005, lower: 4511, upper: 22555 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2330, upper: 32969 }
        }
      }
    }
  },
  chongqing: {
    name: '重庆',
    years: {
      '2025': {
        label: '2025年度（2025-01 ~ 2025-12）',
        effective: ['2025-01', '2025-12'],
        pending: false,
        items: {
          pension:      { personal: 0.08,  lower: 4404, upper: 22017 },
          medical:      { personal: 0.02,  lower: 4404, upper: 22017 },
          unemployment: { personal: 0.005, lower: 4404, upper: 22017 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2100, upper: 26514 }
        }
      },
      '2026': {
        label: '2026年度（2026-01 ~ 2026-12，暂按2025年度标准执行）',
        effective: ['2026-01', '2026-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4404, upper: 22017 },
          medical:      { personal: 0.02,  lower: 4404, upper: 22017 },
          unemployment: { personal: 0.005, lower: 4404, upper: 22017 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2100, upper: 26514 }
        }
      }
    }
  },
  wuhan: {
    name: '武汉',
    years: {
      '2025': {
        label: '2025年度（2025-01 ~ 2025-12）',
        effective: ['2025-01', '2025-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4494, upper: 22470 },
          medical:      { personal: 0.02,  lower: 4494, upper: 22470 },
          unemployment: { personal: 0.005, lower: 4494, upper: 22470 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2210, upper: 28092 }
        }
      },
      '2026': {
        label: '2026年度（2026-01 ~ 2026-12，沿用参考值，待核对）',
        effective: ['2026-01', '2026-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4494, upper: 22470 },
          medical:      { personal: 0.02,  lower: 4494, upper: 22470 },
          unemployment: { personal: 0.005, lower: 4494, upper: 22470 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2210, upper: 28092 }
        }
      }
    }
  },
  xian: {
    name: '西安',
    years: {
      '2025': {
        label: '2025年度（2025-01 ~ 2025-12）',
        effective: ['2025-01', '2025-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4369, upper: 21846 },
          medical:      { personal: 0.02,  lower: 4369, upper: 21846 },
          unemployment: { personal: 0.005, lower: 4369, upper: 21846 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2160, upper: 26412 }
        }
      },
      '2026': {
        label: '2026年度（2026-01 ~ 2026-12）',
        effective: ['2026-01', '2026-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 4737, upper: 23685 },
          medical:      { personal: 0.02,  lower: 4737, upper: 23685 },
          unemployment: { personal: 0.005, lower: 4737, upper: 23685 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2160, upper: 26412 }
        }
      }
    }
  },
  tianjin: {
    name: '天津',
    years: {
      '2025': {
        label: '2025年度（2025-01 ~ 2025-12）',
        effective: ['2025-01', '2025-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 5013, upper: 25065 },
          medical:      { personal: 0.02,  lower: 5013, upper: 25065 },
          unemployment: { personal: 0.005, lower: 5013, upper: 25065 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2180, upper: 25539 }
        }
      },
      '2026': {
        label: '2026年度（2026-01 ~ 2026-12，沿用参考值，待核对）',
        effective: ['2026-01', '2026-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: 5013, upper: 25065 },
          medical:      { personal: 0.02,  lower: 5013, upper: 25065 },
          unemployment: { personal: 0.005, lower: 5013, upper: 25065 },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: 2180, upper: 25539 }
        }
      }
    }
  },
  custom: {
    name: '自定义',
    years: {
      custom: {
        label: '自定义政策',
        effective: ['2000-01', '2999-12'],
        pending: true,
        items: {
          pension:      { personal: 0.08,  lower: null, upper: null },
          medical:      { personal: 0.02,  lower: null, upper: null },
          unemployment: { personal: 0.005, lower: null, upper: null },
          fund:         { personal: 0.05, rates: [0.05, 0.06, 0.08, 0.10, 0.12], lower: null, upper: null }
        }
      }
    }
  }
};
