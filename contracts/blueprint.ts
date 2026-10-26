export type CoverageStatus = "current" | "partial" | "planned";
export type BuildPriority = "已交付" | "P0" | "P1" | "P2";
export type SourceKind = "监管要求" | "国际准则" | "官方标准" | "行业实践";
export type BlueprintTarget = "dashboard" | "rules" | "designer" | "simulator" | "allocation" | "validation" | "approval" | "accounts";

export interface ResearchSource {
  id: string;
  title: string;
  organization: string;
  date: string;
  url: string;
  kind: SourceKind;
  scope: string;
  insight: string;
}

export interface Capability {
  id: string;
  order: string;
  name: string;
  english: string;
  domain: "组织与方案" | "核算与归属" | "结果与兑现" | "平台与数据";
  status: CoverageStatus;
  priority: BuildPriority;
  summary: string;
  objects: string[];
  features: string[];
  roles: string[];
  input: string;
  output: string;
  current: string;
  gap: string;
  sourceIds: string[];
  existingTargets?: BlueprintTarget[];
}

export interface ArchitectureLayer {
  id: string;
  name: string;
  english: string;
  mission: string;
  current: string[];
  target: string[];
}

export interface CoreEntity {
  name: string;
  authority: string;
  owner: string;
  status: CoverageStatus;
  note: string;
}

export interface GovernanceStep {
  id: string;
  order: string;
  name: string;
  status: CoverageStatus;
  owner: string;
  states: string;
  input: string;
  output: string;
  control: string;
}

export interface RoadmapPhase {
  phase: "P0" | "P1" | "P2";
  name: string;
  timing: string;
  objective: string;
  scope: string[];
  dependencies: string[];
  acceptance: string[];
}

export const coverageMeta: Record<CoverageStatus, { label: string; short: string; description: string }> = {
  current: { label: "已有能力", short: "已有", description: "当前版本已有可实际操作的功能，仍须按生产要求持续完善" },
  partial: { label: "部分覆盖", short: "部分", description: "已有局部功能，但尚未形成完整业务流程" },
  planned: { label: "规划中", short: "规划", description: "后续建设内容，不代表当前已交付或已连接" },
};

export const researchSources: ResearchSource[] = [
  {
    id: "R01",
    title: "银行业金融机构绩效考评监管指引",
    organization: "原中国银监会／国家金融监督管理总局官网",
    date: "2012-06-12",
    url: "https://www.nfra.gov.cn/cn/view/pages/governmentDetail.html?docId=887955&generaltype=1",
    kind: "监管要求",
    scope: "银行业金融机构；具体适用以机构类型和监管要求为准",
    insight: "综合绩效覆盖合规经营、风险管理、经营效益、发展转型、社会责任；强调上级审批、统一执行、过程透明、结果报送和控制部门独立履职。",
  },
  {
    id: "R02",
    title: "关于健全金融机构公司治理的指导意见",
    organization: "金融监管总局、中国人民银行、中国证监会、财政部",
    date: "2026-03-16",
    url: "https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=1266349&itemId=928",
    kind: "监管要求",
    scope: "金融机构；政策性金融机构参照执行",
    insight: "内部绩效坚持收益与风险兼顾、注重长周期考核，严格落实关键人员延期支付和追索扣回，并将审计结果及整改情况用于绩效与问责。",
  },
  {
    id: "R03",
    title: "商业银行稳健薪酬监管指引",
    organization: "原中国银监会／中国政府网",
    date: "2010-02-21",
    url: "https://www.gov.cn/gongbao/content/2010/content_1694240.htm",
    kind: "监管要求",
    scope: "商业银行；其他相关机构依规定参照",
    insight: "区分基本薪酬、绩效薪酬、中长期激励和福利；绩效薪酬反映风险成本，关键人员涉及延期支付、追索扣回、信息披露和专项审计。",
  },
  {
    id: "R04",
    title: "银行保险机构公司治理准则",
    organization: "原中国银保监会／国家金融监督管理总局官网",
    date: "2021-06发布",
    url: "https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=989061&itemId=928",
    kind: "监管要求",
    scope: "银行保险机构",
    insight: "绩效考核兼顾收益与风险、长期与短期；建立延期支付和追索扣回机制，明确关键岗位，保障员工信息与救济渠道，记录应完整可追溯。",
  },
  {
    id: "R05",
    title: "关于建立完善银行保险机构绩效薪酬追索扣回机制的指导意见",
    organization: "原中国银保监会办公厅／中国政府网",
    date: "2021-01-28",
    url: "https://www.gov.cn/zhengce/zhengceku/2021-02/16/content_5587284.htm",
    kind: "监管要求",
    scope: "银行保险机构；明确高级管理人员和关键岗位等适用对象",
    insight: "制度需覆盖适用情形、比例、程序、责任部门、争议处理、监督和问责；追索扣回包括追回已支付与止付未支付，并适用于离职和退休人员。",
  },
  {
    id: "R06",
    title: "商业银行内部控制指引",
    organization: "原中国银监会／中国政府网",
    date: "2014-09-12",
    url: "https://www.gov.cn/gongbao/content/2015/content_2821645.htm",
    kind: "监管要求",
    scope: "商业银行；其他监管机构依规定参照",
    insight: "要求不相容岗位分离、动态授权、定期核对、信息可追溯和业务连续性；内控与内部审计部门采用区别于业务部门的绩效考评方式。",
  },
  {
    id: "R07",
    title: "金融机构合规管理办法",
    organization: "国家金融监督管理总局",
    date: "2024-12发布；2025-03-01施行",
    url: "https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=1192220&itemId=924&generaltype=0",
    kind: "监管要求",
    scope: "金融监管总局及其派出机构监管的金融机构，其他机构依规定参照",
    insight: "合规管理覆盖全员全流程；合规人员考核不得以业务部门经营业绩等损害独立性的方式开展，合规结果应进入员工考核、任用和评优。",
  },
  {
    id: "R08",
    title: "银行保险机构数据安全管理办法",
    organization: "国家金融监督管理总局",
    date: "2024-12-27",
    url: "https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=1192311&itemId=928&generaltype=0",
    kind: "监管要求",
    scope: "银行保险机构及相关数据处理活动",
    insight: "覆盖数据目录、分类分级、最小必要授权、来源追溯、敏感数据保护、日志审计、备份恢复、测试隔离、模型可审核追溯和集中外联。",
  },
  {
    id: "R09",
    title: "银行业金融机构数据治理指引",
    organization: "原中国银保监会／中国政府网",
    date: "2018-05-21",
    url: "https://www.gov.cn/zhengce/zhengceku/2018-12/31/content_5450808.htm",
    kind: "监管要求",
    scope: "银行业金融机构；外国银行分行等依规定参照",
    insight: "数据质量覆盖真实性、准确性、连续性、完整性和及时性；质量考核纳入绩效，建立整改跟踪、口径一致、审计和应急机制。",
  },
  {
    id: "R10",
    title: "银行业金融机构从业人员行为管理指引",
    organization: "原中国银监会／国家金融监督管理总局官网",
    date: "2018-03-20",
    url: "https://www.nfra.gov.cn/cn/view/pages/ItemDetail.html?docId=174506",
    kind: "监管要求",
    scope: "银行业金融机构从业人员",
    insight: "行为评估与薪酬、晋升和关键岗位管理衔接，支持举报、责任追究以及离职退休后的责任追溯。",
  },
  {
    id: "R11",
    title: "商业银行负债质量管理办法",
    organization: "原中国银保监会／中国政府网",
    date: "2021-03-23",
    url: "https://www.gov.cn/zhengce/zhengceku/2021-03/27/content_5596194.htm",
    kind: "监管要求",
    scope: "商业银行负债业务；相关机构依规定参照",
    insight: "负债质量纳入绩效和内部审计；不得设置存款时点规模、市场份额、排名或同业比较类不当指标，分支机构不得层层加码。",
  },
  {
    id: "R12",
    title: "重庆银保监局关于辖内银行业金融机构绩效考评工作的指导意见",
    organization: "原重庆银保监局／国家金融监督管理总局官网",
    date: "2023-04-24",
    url: "https://www.nfra.gov.cn/branch/chongqing/view/pages/common/ItemDetail.html?docId=1105958&itemId=4201",
    kind: "监管要求",
    scope: "重庆辖内银行业金融机构；此处仅作为地方监管细化参考",
    insight: "细化五类指标、内控评价、数据治理、信息平台和结果运用；禁止以开门红、劳动竞赛或专项奖励变相突破综合考评及层层加码。",
  },
  {
    id: "R13",
    title: "Basel Framework CGO10 — Corporate governance",
    organization: "Basel Committee on Banking Supervision / BIS",
    date: "2026-01-01",
    url: "https://www.bis.org/committees/bcbs/basel-consolidated-guidelines/module/cgo/10",
    kind: "国际准则",
    scope: "国际银行公司治理原则；各司法辖区结合本地制度采用",
    insight: "董事会监督薪酬与风险文化、风险偏好的一致性；控制职能独立，薪酬反映风险结果，支持延期支付、未支付薪酬扣减、已支付薪酬追回和透明披露。",
  },
  {
    id: "R14",
    title: "关于金融数据、算法与科技伦理治理的政协提案答复",
    organization: "中国人民银行",
    date: "2022-10-27",
    url: "http://www.pbc.gov.cn/zhengwugongkai/4081330/4081344/4081419/4081727/4786621/index.html",
    kind: "官方标准",
    scope: "官方答复及所述金融行业标准，不替代具体标准文本",
    insight: "涉及数据能力、分类分级、生命周期安全、个人金融信息保护，以及算法安全、可解释性、精准性和评价要求。",
  },
  {
    id: "R15",
    title: "Oracle Incentive Compensation — 官方产品资料",
    organization: "Oracle",
    date: "在线产品资料；2026-10检索",
    url: "https://www.oracle.com/cx/sales/sales-performance-management/incentive-compensation/",
    kind: "行业实践",
    scope: "通用激励补偿产品能力，不是中国银行监管要求",
    insight: "提供计划设计、业绩归属与层级汇总、跨组织归属、多币种、支付审批、预估模拟和分析等通用能力。",
  },
  {
    id: "R16",
    title: "Overview of Incentive Compensation Transaction Processing",
    organization: "Oracle Help Center",
    date: "在线官方文档；2026-10检索",
    url: "https://docs.oracle.com/en/cloud/saas/sales/facmi/overview-of-incentive-compensation-transaction-processing.html",
    kind: "行业实践",
    scope: "通用交易到支付处理链，不是中国银行监管要求",
    insight: "处理链覆盖导入、收集、分类、归属、汇总、计算和支付；计算仅使用人员与日期范围内有效且处于启用状态的计划。",
  },
  {
    id: "R17",
    title: "Incentive Management Portal — User Guide",
    organization: "SAP",
    date: "2025-01-17文档版本",
    url: "https://help.sap.com/doc/39b334b9b6934a37bf922e97e4958909/SHIP/en-US/7272d90b7c231014a804993ce4041860.pdf",
    kind: "行业实践",
    scope: "通用激励管理门户，不是中国银行监管要求",
    insight: "员工可查看方案、确认文件和提交争议；争议具有唯一编号、分派、状态、历史、撤回、审批与解决流程。",
  },
  {
    id: "R18",
    title: "Incentive Compensation Management for Financial Services Institutions",
    organization: "Anaplan",
    date: "在线官方资料；2026-10检索",
    url: "https://www.anaplan.com/resources/datasheets/incentive-compensation-management-financial-services-institutions/",
    kind: "行业实践",
    scope: "金融服务激励补偿通用实践，不是中国银行监管要求",
    insight: "强调不同方案的对比试算、复杂流程自动处理、员工自助查询绩效，以及跨地区统一方案与年中调整。",
  },
];

export const capabilities: Capability[] = [
  {
    id: "C01", order: "01", name: "组织人员与岗位", english: "ORGANIZATION & POSITION", domain: "组织与方案", status: "partial", priority: "P0",
    summary: "先确定谁在什么组织、岗位和期间被考，再确定适用什么方案、权限与风险约束。",
    objects: ["机构", "人员", "岗位", "任职关系", "关键岗位", "角色与数据范围"],
    features: ["组织树与人员全生命周期", "岗位、职级、条线和任职生效日期", "高管及风险关键岗位名录", "不相容岗位与控制条线独立标识", "历史组织与人员快照"],
    roles: ["人力资源", "风险管理", "合规管理", "绩效管理", "统一身份管理"],
    input: "HR 组织人员主数据、岗位说明、关键岗位认定、IAM 身份与权限",
    output: "分期间有效的考核对象、人员—岗位—机构关系、角色及数据范围",
    current: "演示环境已实现本地账号密码登录、六类岗位角色、本人／本机构／全行数据范围和服务端权限校验；未连接 HR 或统一身份认证。",
    gap: "缺 HR 权威主数据、入转调离生效日期、关键岗位标识、历史组织快照，以及生产级统一身份认证和多因素认证。",
    sourceIds: ["R01", "R03", "R04", "R05", "R06", "R07"],
    existingTargets: ["accounts"],
  },
  {
    id: "C02", order: "02", name: "绩效周期与方案", english: "PERFORMANCE PLAN", domain: "组织与方案", status: "planned", priority: "P0",
    summary: "用统一方案管住考核对象、周期、指标组合、权重、适用范围、审批和年中调整。",
    objects: ["绩效周期", "考核方案", "方案版本", "适用对象", "指标组合", "审批单"],
    features: ["年度／季度／月度周期", "五类综合绩效指标与权重", "机构、岗位和人员适用范围", "草稿—复核—批准—生效—停用", "年中调整、例外审批与上级备案"],
    roles: ["董事会及薪酬委员会", "高级管理层", "计划财务", "人力资源", "风险合规", "分支机构"],
    input: "年度经营计划、风险偏好、监管要求、上级方案、指标库和组织人员范围",
    output: "分期间、分对象有效的方案版本及完整审批证据",
    current: "已有单指标设计、复核和发布，但没有把多个指标组装为综合绩效方案。",
    gap: "缺方案级权重与适用对象、上级审批、年中调整、例外管理、五类指标组合和防止体系外奖励的控制。",
    sourceIds: ["R01", "R02", "R03", "R12"],
  },
  {
    id: "C03", order: "03", name: "目标分解", english: "TARGET CASCADE", domain: "组织与方案", status: "planned", priority: "P1",
    summary: "把经营计划转为可校验的目标，不允许下级自行加码或以临时专项突破综合方案。",
    objects: ["经营目标", "目标值", "分解任务", "目标调整", "机构承诺"],
    features: ["战略—机构—团队—个人逐级分解", "目标口径、基准和挑战值", "时点规模与不当排名规则拦截", "层层加码和权重复核", "调整申请、审批与版本比较"],
    roles: ["计划财务", "业务条线", "分支机构", "风险合规", "审批人"],
    input: "董事会批准的年度经营计划、方案权重、资源约束、历史完成值",
    output: "经审批的目标树、分解差异、目标版本及调整记录",
    current: "当前试算接收业务实际值并按规则计算积分，不管理经营目标或目标分解。",
    gap: "缺目标树、达成率、目标审批、加码识别、目标与经营计划一致性校验和调整留痕。",
    sourceIds: ["R01", "R11", "R12", "R15"],
  },
  {
    id: "C04", order: "04", name: "指标与计价", english: "INDICATOR & PRICING", domain: "核算与归属", status: "current", priority: "已交付",
    summary: "把指标定义、算法、单价、取数关联、公式、考核细则和版本发布集中管理。",
    objects: ["指标", "计价规则", "算法", "单价", "公式", "取数映射", "版本"],
    features: ["新增指标与正式指标新版", "五类算法与安全自定义公式", "存量／正增／负增单价与单位换算", "四组场景测试和服务端校验", "复核发布、停用、归档和历史快照"],
    roles: ["计价管理员", "业务条线", "计划财务", "复核人", "发布审批人"],
    input: "指标制度、产品目录、取数口径、单价标准、考核细则",
    output: "可版本化执行的指标定义和正式计价规则",
    current: "已有 51 项年度规则、完整指标设计中心、五类算法、安全公式、场景测试、发布归档和版本快照。",
    gap: "后续需扩展非计价定性指标、综合方案权重、跨方案复用、更多回归场景和生效期冲突检查。",
    sourceIds: ["R01", "R02", "R11", "R12", "R15", "R16"],
    existingTargets: ["designer", "rules"],
  },
  {
    id: "C05", order: "05", name: "数据接入与质量", english: "DATA & QUALITY GATE", domain: "平台与数据", status: "partial", priority: "P0",
    summary: "所有计算先回答数据从哪来、是否完整准确、能否对账，再允许进入核算。",
    objects: ["源交易", "数据快照", "数据标准", "质量规则", "对账单", "数据追溯", "整改单"],
    features: ["API／批量／消息接入与暂存区", "完整性、唯一性、及时性、有效性检查", "控制总数、金额和人数对账", "质量检查、隔离整改与放行审批", "源系统—指标—归属—结果的数据追溯"],
    roles: ["数据归口部门", "源系统业务责任部门", "信息科技", "计划财务", "内部审计"],
    input: "核心、信贷、信用卡、CRM、财务、风险合规等权威数据与接口契约",
    output: "可核算数据快照、质量报告、对账差异、整改证据和数据追溯标识",
    current: "已有 M 码／科目映射、单位换算和历史公式异常核查；未声称已联通生产源系统。",
    gap: "缺真实数据采集、数据快照、自动质量检查、财务对账、数据追溯记录、整改跟踪和数据责任部门确认。",
    sourceIds: ["R01", "R06", "R08", "R09", "R14", "R16"],
    existingTargets: ["validation", "rules"],
  },
  {
    id: "C06", order: "06", name: "业绩归属与分润", english: "CREDIT & ALLOCATION", domain: "核算与归属", status: "current", priority: "已交付",
    summary: "把客户、账户和交易贡献分配到人员与机构，确保原始业务不重复入账。",
    objects: ["客户", "账户", "交易", "归属关系", "分润方案", "层级汇总"],
    features: ["主办／协办／跨机构分润", "比例合计校验", "业务发生机构与积分归属机构双口径", "归属调整与冲正原则", "分润原因和状态留痕"],
    roles: ["业务条线", "团队负责人", "分支机构", "计价管理员", "复核人"],
    input: "源交易、客户与账户关系、人员岗位、归属规则、协同分润依据",
    output: "归属交易、分润明细、机构与个人业绩归属",
    current: "已有多人按比例分润，支持原因录入、比例合计校验、机构范围和客户经理本人参与校验；跨机构登记仅限全行权限岗位。",
    gap: "后续需连接源交易、增加归属生效期、逐级汇总、争议锁定、重复归属检测和审批后冲正。",
    sourceIds: ["R01", "R15", "R16"],
    existingTargets: ["allocation"],
  },
  {
    id: "C07", order: "07", name: "核算试算与重算", english: "CALCULATION & RERUN", domain: "核算与归属", status: "current", priority: "已交付",
    summary: "用同一套计算规则完成试算、批量核算、结果解释、历史核对和受控重算。",
    objects: ["核算批次", "数据快照", "规则快照", "计算明细", "重算任务", "冲正批次"],
    features: ["实时试算与计算过程解释", "批次草稿、复核和审批锁定", "规则版本与完整定义快照", "零值、负积分、封顶保底和单位边界", "防止重复核算、跨期冲正和补录设计"],
    roles: ["计价管理员", "核算人员", "复核人", "审批人", "信息科技"],
    input: "有效方案与规则、已放行数据快照、归属结果、期间和重算原因",
    output: "可解释计算明细、结果快照、差异报告、冲正与补录记录",
    current: "已有服务端复算、试算保存、批次流转和审批锁定；历史批次保留适用规则快照。",
    gap: "全量生产核算、组织与数据快照、重复重算识别、跨期冲正、并行调度和差异自动比较属于后续增强。",
    sourceIds: ["R01", "R03", "R06", "R15", "R16", "R18"],
    existingTargets: ["simulator", "approval"],
  },
  {
    id: "C08", order: "08", name: "风险合规调整", english: "RISK & COMPLIANCE ADJUSTMENT", domain: "结果与兑现", status: "planned", priority: "P0",
    summary: "把风险事件、内控评价、合规考核、审计整改和从业人员行为转化为可复核的调整。",
    objects: ["风险事件", "合规事件", "内控评价", "审计发现", "行为评估", "调整单"],
    features: ["风险成本与合规扣减", "一票否决和等级调整规则", "审计整改与数据质量联动", "控制条线独立考核方案", "尽职免责、责任认定、复核与申诉衔接"],
    roles: ["风险管理", "合规管理", "内部审计", "人力资源", "计划财务", "责任认定机构"],
    input: "风险合规事件、内控评价、审计结果、行为评估、监管处罚与责任认定",
    output: "调整前后结果、调整依据、责任对象、审批记录和追索触发事件",
    current: "现有异常校验针对公式与取数技术质量，不等于风险合规调整。",
    gap: "缺风险事件模型、责任认定、调整规则、人工复核、独立条线方案、尽职免责和追索联动。",
    sourceIds: ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R10", "R11", "R12", "R13"],
  },
  {
    id: "C09", order: "09", name: "结果审核与发布", english: "RESULT APPROVAL & PUBLICATION", domain: "结果与兑现", status: "partial", priority: "P0",
    summary: "把数据、归属、规则、调整和审批证据作为一个结果包审核，再按范围发布。",
    objects: ["绩效结果", "结果快照", "审核任务", "发布单", "员工确认状态"],
    features: ["多级复核与职责分离", "总分、明细、调整和异常联合审核", "驳回原因与重新提交", "按机构／个人数据范围发布", "发布后只读与跨期更正"],
    roles: ["核算人员", "业务复核人", "风险合规", "计划财务", "审批人", "员工"],
    input: "锁定计算明细、质量报告、归属确认、风险调整和审批意见",
    output: "已审批结果包、个人结果单、发布回执和可审计版本",
    current: "已有批次明细与规则快照、提交复核、填写原因退回、草稿编辑重算、重新提交、独立审批锁定和操作日志。",
    gap: "缺多级差异化审核、结果包联合检查、按数据范围发布、员工结果单和发布后确认状态。",
    sourceIds: ["R01", "R06", "R15", "R16", "R17"],
    existingTargets: ["approval"],
  },
  {
    id: "C10", order: "10", name: "员工确认与申诉", english: "CONFIRMATION & APPEAL", domain: "结果与兑现", status: "partial", priority: "P1",
    summary: "让员工看得懂结果、找得到依据、提得出异议，并获得有期限、有分工的处理结论。",
    objects: ["结果确认", "申诉单", "补充材料", "争议任务", "处理结论"],
    features: ["员工自助结果与计算过程", "方案文件确认和异议提交", "唯一编号、分派、补充询问和撤回", "受理—调查—复核—解决／驳回", "时限提醒、争议期间支付控制和历史留痕"],
    roles: ["员工", "直线经理", "计价管理员", "人力资源", "风险合规", "独立复核人"],
    input: "已发布结果、方案与规则快照、申诉理由、证明材料",
    output: "确认回执、申诉处理结论、更正任务和争议完整历史",
    current: "员工可查看并确认本人分润，系统保存确认人和时间；完整结果发布、结果确认和申诉办理尚未实现。",
    gap: "需接入生产身份体系，新建结果发布与结果单、方案文件确认、申诉状态、材料管理、处理时限、独立复核和与冲正／支付的衔接。",
    sourceIds: ["R04", "R05", "R17"],
    existingTargets: ["allocation"],
  },
  {
    id: "C11", order: "11", name: "薪酬兑现与递延追索", english: "PAYMENT, DEFERRAL & CLAWBACK", domain: "结果与兑现", status: "planned", priority: "P1",
    summary: "绩效结果交给薪酬体系后，继续跟踪当期支付、递延、止付、追回和实际回执。",
    objects: ["薪酬测算", "支付指令", "支付回执", "递延台账", "止付单", "追索案件"],
    features: ["绩效结果到薪酬系统的受控接口", "当期支付与延期支付计划", "关键岗位、离职退休人员适用标识", "未支付薪酬止付与已支付薪酬追回", "争议处理、年度审核、披露和支付对账"],
    roles: ["人力资源", "计划财务", "风险管理", "合规管理", "薪酬委员会", "董事会", "支付系统"],
    input: "已确认绩效结果、薪酬政策、风险事件、关键岗位、劳动合同和外部支付回执",
    output: "薪酬接口文件、递延与追索台账、止付／追回状态、对账及披露数据",
    current: "当前只计算和展示计价积分，不计算应发工资、个税或实际薪资，也没有支付接口。",
    gap: "必须明确四本账边界，新建薪酬接口、递延和追索子账、外部回执、争议程序、年度审核和披露。",
    sourceIds: ["R02", "R03", "R04", "R05", "R13", "R15", "R16"],
  },
  {
    id: "C12", order: "12", name: "经营分析与监管报送", english: "ANALYTICS & REPORTING", domain: "结果与兑现", status: "partial", priority: "P1",
    summary: "同一结果底座服务经营分析、董事会审查、薪酬披露和监管报送，保持口径一致。",
    objects: ["分析主题", "管理报表", "监管报送", "披露数据集", "指标口径"],
    features: ["机构／人员／产品／方案多维分析", "预算、达成、积分、风险调整和支付趋势", "董事会年度审查与追索扣回报告", "监管报送、薪酬披露和口径一致性", "从汇总指标下钻至结果与源证据"],
    roles: ["经营管理层", "计划财务", "人力资源", "监管报送部门", "董事会办公室", "内部审计"],
    input: "已发布结果、目标、质量与对账状态、薪酬和追索台账、统一指标口径",
    output: "经营分析、监管报送包、披露数据、审查材料和可追溯明细",
    current: "已有按角色和机构范围展示的工作台，以及规则、批次和核查清单 CSV 导出。",
    gap: "缺统一语义口径、目标达成与风险调整分析、董事会审查、监管报送、披露和跨报表一致性校验。",
    sourceIds: ["R01", "R03", "R05", "R08", "R09", "R15", "R17", "R18"],
    existingTargets: ["dashboard", "approval"],
  },
  {
    id: "C13", order: "13", name: "权限与审计", english: "ACCESS & AUDIT", domain: "平台与数据", status: "partial", priority: "P0",
    summary: "权限不仅控制能否点击，还要控制能看哪家机构、哪类人员、哪一级敏感数据。",
    objects: ["用户", "角色", "权限", "数据范围", "职责分离规则", "审计事件"],
    features: ["角色权限与机构／条线／个人数据范围", "设计、复核、发布、核算、审批职责分离", "敏感字段最小化、加密和脱敏", "访问记录、导出审批和定期复核", "不可变审计、前后值、原因和证据链"],
    roles: ["系统管理员", "安全管理员", "数据责任部门", "内部审计", "合规管理", "普通用户"],
    input: "IAM 身份、岗位角色、机构范围、数据分类分级和授权审批",
    output: "有效权限、越权拦截、访问与操作日志、权限复核和审计证据",
    current: "已有六类角色、机构数据范围、服务端接口授权、账号停用后会话失效和主要业务操作日志；当前为本地演示账号体系。",
    gap: "缺生产统一身份认证、多因素认证、加密脱敏、日志防篡改、留存策略和定期权限复核。",
    sourceIds: ["R04", "R05", "R06", "R07", "R08", "R09", "R13", "R17"],
    existingTargets: ["approval", "accounts"],
  },
  {
    id: "C14", order: "14", name: "集成配置与运维", english: "INTEGRATION & OPERATIONS", domain: "平台与数据", status: "partial", priority: "P0",
    summary: "以可恢复的集成、可观测的调度和经过演练的连续性保障每个考核周期。",
    objects: ["接口", "批量任务", "消息", "调度计划", "运行告警", "备份与恢复"],
    features: ["API／批量／消息接口约定", "重复处理识别、限量重试、异常待处理、补偿和人工重跑", "任务编排、依赖、日历和窗口控制", "日志、指标、链路、告警和审计", "容量、备份、恢复演练、容灾与业务连续性"],
    roles: ["信息科技", "运维人员", "源系统团队", "安全团队", "业务连续性管理", "业务责任部门"],
    input: "接口契约、数据分级、任务依赖、业务量基线、可用性与连续性要求",
    output: "稳定接口、任务回执、运行指标、告警工单、恢复证据和容量报告",
    current: "已有 React／Hono 应用、真实 MySQL 持久化、tRPC API、CSV 导出和生产冷启动验证。",
    gap: "缺企业系统集成、统一调度、失败补偿、完整运行监控、密钥与脱敏、恢复演练、容灾和容量服务目标。",
    sourceIds: ["R06", "R08", "R09", "R14", "R15", "R16"],
  },
];

export const architectureLayers: ArchitectureLayer[] = [
  {
    id: "L1", name: "渠道层", english: "CHANNELS", mission: "按角色提供最小必要信息与操作，不让管理端、员工端和监管端共享无边权视图。",
    current: ["六类角色工作台", "本人／本机构／全行数据范围", "桌面与移动端适配", "CSV 导出"],
    target: ["员工自助与申诉", "董事会／薪酬委员会视图", "风险合规与审计工作台", "监管报送与披露工作台"],
  },
  {
    id: "L2", name: "业务应用层", english: "BUSINESS APPLICATIONS", mission: "围绕 14 个功能模块组织业务流程，页面只是入口，实际办理仍须遵守业务规则和状态要求。",
    current: ["指标设计", "计价规则", "计价试算", "归属分润", "规则核查", "批次管理", "账号权限", "建设方案"],
    target: ["组织与方案", "目标分解", "数据质量门禁", "风险合规调整", "结果发布与确认", "争议申诉", "薪酬递延追索", "监管报送"],
  },
  {
    id: "L3", name: "领域服务层", english: "DOMAIN SERVICES", mission: "把方案、归属、计算、调整、结果、申诉和支付约束做成独立可测试服务，统一版本与状态。",
    current: ["白名单公式校验", "单价与五类算法", "比例校验", "规则版本快照", "批次审批"],
    target: ["方案与目标服务", "质量与对账服务", "归属与逐级汇总", "核算／冲正／重算", "风险调整", "结果与申诉工作流", "支付／递延／追索台账"],
  },
  {
    id: "L4", name: "数据层", english: "DATA & EVIDENCE", mission: "主数据、交易、规则、结果和支付分域存储，以快照和数据追溯记录支持历史核对、对账和审计。",
    current: ["规则与设计稿", "分润记录", "试算批次", "规则快照", "操作日志"],
    target: ["组织人员主数据", "源交易与数据快照", "质量／数据追溯／对账", "结果与申诉", "支付／递延／追索子账", "不可变审计证据"],
  },
  {
    id: "L5", name: "集成层", english: "INTEGRATION", mission: "通过受控 API、批量和消息连接权威系统，以重复处理识别、失败补偿和回执核对跨系统处理结果。",
    current: ["tRPC API", "CSV 文件导出"],
    target: ["HR／IAM", "核心／信贷／信用卡／CRM", "风险／合规／审计", "财务／薪酬／税务／支付", "API／批量／消息网关", "失败补偿与对账回执"],
  },
  {
    id: "L6", name: "基础设施层", english: "PLATFORM & RESILIENCE", mission: "用安全管理、任务调度、运行监控和连续性措施支撑业务办理，按业务影响确定容量、备份和恢复目标。",
    current: ["React／Hono 运行时", "MySQL 数据库", "生产构建与隔离冷启动验证"],
    target: ["统一任务调度", "运行监控、告警与请求追踪", "密钥、加密与脱敏", "备份恢复验证", "容灾与业务连续性演练", "容量基线与服务目标"],
  },
];

export const coreEntities: CoreEntity[] = [
  { name: "组织 Organization", authority: "HR 组织机构主数据／机构管理制度", owner: "人力资源", status: "planned", note: "保留组织层级、机构性质与生效日期" },
  { name: "人员 Employee", authority: "HR 人员主数据", owner: "人力资源", status: "planned", note: "入转调离与退休人员身份不得靠页面手工维护" },
  { name: "岗位 Position", authority: "HR 岗位体系＋关键岗位认定名录", owner: "人力资源／风险合规", status: "planned", note: "支持控制条线、关键风险岗位和不相容岗位标识" },
  { name: "客户 Customer", authority: "ECIF／CRM 客户主数据", owner: "客户主管部门", status: "planned", note: "计价只取必要标识与关系，避免过度复制个人信息" },
  { name: "账户 Account", authority: "核心及各产品账户系统", owner: "对应业务条线", status: "planned", note: "账户状态、产品、机构与期间以源系统为准" },
  { name: "产品 Product", authority: "企业产品目录／产品工厂", owner: "产品管理部门", status: "planned", note: "指标关联稳定产品编码，不以显示名称代替主键" },
  { name: "指标 Indicator", authority: "本平台指标设计与正式规则库", owner: "计价管理／业务条线", status: "current", note: "定义、算法、单价、取数、公式、细则和版本已有基础" },
  { name: "方案 Scheme", authority: "本平台方案库＋有权人审批文件", owner: "计划财务／人力资源", status: "planned", note: "对象、周期、权重、目标、生效日期和审批一体管理" },
  { name: "批次 Batch", authority: "本平台核算批次与任务记录", owner: "计价管理", status: "current", note: "已有草稿、复核、锁定；目标增加数据快照与重复核算识别标识" },
  { name: "归属 Credit / Allocation", authority: "源交易＋本平台归属分润记录", owner: "业务条线／计价管理", status: "current", note: "原始交易不复制为新的业务事实，调整以冲正留痕" },
  { name: "结果 Performance Result", authority: "本平台审批锁定的结果快照", owner: "绩效管理", status: "partial", note: "已有批次快照；待补员工结果包、发布和确认状态" },
  { name: "风险事件 Risk Event", authority: "风险／合规／审计／纪检等权威事件系统", owner: "对应风险与监督部门", status: "planned", note: "责任认定与调整依据分开保存，支持尽职免责" },
  { name: "申诉 Appeal", authority: "本平台申诉工作流与材料记录", owner: "人力资源／独立复核人", status: "planned", note: "唯一编号、分派、时限、撤回、结论和更正联动" },
  { name: "支付 Payment", authority: "薪酬系统＋财务／资金支付回执", owner: "人力资源／计划财务", status: "planned", note: "平台保存指令和回执，不把积分或接口成功当作已付款" },
  { name: "递延 Deferral", authority: "本平台递延子账＋薪酬实际兑现记录", owner: "人力资源", status: "planned", note: "按人员、原绩效期间、到期计划和风险状态追踪" },
  { name: "追索 Recovery", authority: "责任认定文件＋追索案件＋薪酬／法律执行回执", owner: "人力资源／风险合规", status: "planned", note: "覆盖止付未支付与追回已支付，保留争议和执行状态" },
  { name: "审计 Audit Event", authority: "本平台追加式审计＋企业集中日志平台", owner: "信息科技／内部审计", status: "partial", note: "已有操作日志；目标增加防篡改、留存、访问审计与独立复核" },
];

export const governanceSteps: GovernanceStep[] = [
  { id: "G01", order: "01", name: "方案制定", status: "planned", owner: "计划财务／人力资源／有权审批人", states: "草稿 → 复核 → 批准 → 生效 → 停用", input: "经营计划、风险偏好、上级方案", output: "有效方案版本", control: "驳回回到草稿并保留版本；下级不得绕过上级审批或自行提高标准。" },
  { id: "G02", order: "02", name: "目标分解", status: "planned", owner: "计划财务／业务条线／分支机构", states: "拟定 → 校验 → 审批 → 下达 → 调整", input: "有效方案与目标基准", output: "目标树与调整记录", control: "拦截时点规模、不当排名、权重突破和层层加码；调整重新审批。" },
  { id: "G03", order: "03", name: "数据接入与放行", status: "partial", owner: "数据责任部门／信息科技／计划财务", states: "接收 → 质检 → 隔离／对账 → 放行", input: "权威源数据与接口批次", output: "可核算数据快照", control: "质检失败不得进入核算；整改后形成新快照，不直接覆盖原始接收记录。" },
  { id: "G04", order: "04", name: "归属确认", status: "current", owner: "业务条线／团队负责人／复核人", states: "拟定 → 校验 → 确认 → 调整／冲正", input: "源交易与分润依据", output: "人员及机构业绩归属", control: "同一交易防止重复归属，比例合计受控；争议期间锁定相关归属。" },
  { id: "G05", order: "05", name: "核算试算", status: "current", owner: "计价管理员／核算人员", states: "草稿 → 试算 → 批次生成 → 待复核", input: "有效规则、数据快照与归属结果", output: "可解释计算明细", control: "按人员、期间、方案版本和数据快照识别重复核算；重算必须产生差异报告。" },
  { id: "G06", order: "06", name: "风险合规调整", status: "planned", owner: "风险／合规／审计／责任认定机构", states: "待评估 → 调整拟定 → 复核 → 生效", input: "风险事件、内控评价与责任认定", output: "调整单及调整后结果", control: "保留调整前后值、依据与责任对象；支持尽职免责和独立复核。" },
  { id: "G07", order: "07", name: "结果复核", status: "partial", owner: "业务复核／风险合规／审批人", states: "草稿 → 复核中 → 退回修改／审批锁定", input: "结果包与全部控制证据", output: "锁定结果快照", control: "复核人与核算人分离；当前可逐条核对批次明细、填写原因退回并重新提交，操作日志保留每次办理记录。" },
  { id: "G08", order: "08", name: "发布与确认", status: "planned", owner: "绩效管理／员工", states: "待发布 → 已发布 → 已查看 → 已确认／有异议", input: "锁定结果与发布范围", output: "个人结果单与确认回执", control: "按个人和机构数据范围发布；确认不等于放弃依法依约提出异议的权利。" },
  { id: "G09", order: "09", name: "申诉与更正", status: "planned", owner: "员工／直线经理／独立复核人", states: "提交 → 受理 → 调查 → 复核 → 解决／驳回／撤回", input: "异议、证据与原结果快照", output: "处理结论与更正任务", control: "申诉成立时通过跨期冲正或补录更正，不改写已发布历史。" },
  { id: "G10", order: "10", name: "薪酬测算交接", status: "planned", owner: "人力资源／计划财务", states: "待交接 → 已接收 → 已测算 → 已核对", input: "已确认结果与薪酬政策", output: "薪酬测算及对账结果", control: "计价积分不是应发工资；薪酬、个税和实付由相应专业系统与制度计算。" },
  { id: "G11", order: "11", name: "支付与递延", status: "planned", owner: "薪酬系统／财务支付／人力资源", states: "待支付 → 部分支付／已支付／已递延／已止付", input: "薪酬结果、支付计划和风险状态", output: "支付回执与递延子账", control: "业务工作流与支付状态分离；实际支付只认外部权威回执并定期对账。" },
  { id: "G12", order: "12", name: "追索与结案", status: "planned", owner: "人力资源／风险合规／董事会", states: "触发 → 审查 → 止付／追回 → 争议／执行 → 结案", input: "风险超常暴露、财务重述、造假或违规等触发事件", output: "追索台账、执行回执与年度审查", control: "覆盖离职退休人员；争议、执行与年度报告全程留痕，未结案不得静默关闭。" },
];

export const controlDomains = [
  { id: "S01", name: "身份、权限与职责分离", current: "本地演示账号、六类角色、机构数据范围、服务端接口授权和会话失效控制", target: "接入统一身份认证，完善机构／条线／个人数据范围；设计、复核、发布、核算、审批和支付职责分离并定期复核。", sourceIds: ["R06", "R08", "R17"] },
  { id: "S02", name: "数据分类分级与最小化", current: "未宣称生产级安全体系", target: "建立数据目录和资产地图；按级别实施最小必要采集、传输与存储加密、展示脱敏、测试隔离和到期销毁。", sourceIds: ["R08", "R09", "R14"] },
  { id: "S03", name: "质量检查、数据追溯与对账", current: "M 码映射与历史公式异常核查", target: "完整性、唯一性、及时性、有效性检查；控制总数与财务对账；失败隔离整改；记录源数据到结果的追溯关系。", sourceIds: ["R01", "R09", "R16"] },
  { id: "S04", name: "版本、生效与计算完整性", current: "规则版本、完整定义与批次快照", target: "业务期间和生效日期双维度；保存规则、数据、组织三类快照；相同输入得到相同结果，识别重复重算，通过跨期冲正而非覆盖更正历史。", sourceIds: ["R06", "R16"] },
  { id: "S05", name: "接口稳定性与失败补偿", current: "tRPC API 与 CSV 导出", target: "统一接口约定；识别重复请求，限量重试，记录待处理异常，支持补偿、人工重跑和外部回执对账，避免重复入账或重复支付。", sourceIds: ["R08", "R15", "R16"] },
  { id: "S06", name: "不可变审计与证据链", current: "主要业务操作写日志", target: "追加式记录操作者、时间、对象、前后值、原因和审批；按数据级别执行留存策略，日志防篡改并接受独立审计。", sourceIds: ["R04", "R06", "R08"] },
  { id: "S07", name: "连续性、容量与运行监控", current: "生产构建与隔离冷启动验证", target: "统一调度、运行指标、日志与请求告警；依据业务影响制定恢复时间和数据恢复点目标，开展备份恢复和中断演练，按真实业务量建立容量与性能服务目标。", sourceIds: ["R06", "R08", "R09"] },
  { id: "S08", name: "公式与计算规则管理", current: "白名单公式、分支与边界测试", target: "保持计算规则可解释、可验证、可审核、可追溯；新算法须独立复核与回归测试，自动检查不得代替有权人审批和人工复核。", sourceIds: ["R08", "R14", "R16"] },
];

export const ledgerBoundaries = [
  { id: "B01", name: "业绩账", question: "做成了什么业务？", authority: "权威源系统与归属结果", rule: "客户、账户、交易、产品和业绩归属；原始业务事实不被绩效结果反向修改。" },
  { id: "B02", name: "计价账", question: "按规则得到多少积分？", authority: "本平台规则与结果快照", rule: "记录基数、单价、公式、版本和计算过程；积分是绩效计量结果，不是货币应付款。" },
  { id: "B03", name: "绩效薪酬账", question: "风险调整后应计多少绩效薪酬？", authority: "薪酬制度、风险调整与薪酬系统", rule: "将绩效结果转换为薪酬需另经薪酬政策、总额、风险合规和审批，不等同于积分换算。" },
  { id: "B04", name: "支付账", question: "实际付了多少、递延或追回多少？", authority: "薪酬、财务与资金支付回执", rule: "个税和实付由薪酬支付体系处理；平台只跟踪指令、递延、止付、追回和权威回执。" },
];

export const designPrinciples = [
  { title: "四本账分离", text: "业绩、计价、绩效薪酬、实际支付分别建模、分别对账；特别明确“计价积分 ≠ 应发工资”。这是本项目边界设计，不是对监管原文的改写。" },
  { title: "三类快照回放", text: "每次正式核算绑定规则版本、源数据快照、组织与归属快照；只保存规则快照还不足以完整重现历史。" },
  { title: "双日期与跨期更正", text: "同时记录业务所属期间和规则／数据生效日期；历史错误通过冲正、补录和新版本更正，不覆盖已发布结果。" },
  { title: "办理与支付状态分离", text: "结果批准、员工确认、薪酬交接、实际支付和追索执行是不同状态；接口受理不代表资金已支付。" },
  { title: "先可信，再自动化", text: "P0 先建立主数据、质量检查、权限和审计，再扩大自动核算；自动检查只作为辅助，不代替有权人审批和人工复核。" },
  { title: "规划不冒充现状", text: "建设方案中的目标层、外部接口、薪酬和监管功能均按状态展示；只有当前真实可用的功能计入已有能力。" },
];

export const roadmap: RoadmapPhase[] = [
  {
    phase: "P0", name: "数据基础与关键控制", timing: "优先建设／先于大规模自动核算",
    objective: "守住“考谁、依什么考、数据能否信、结果谁负责”四条底线，同时保留现有计价核心。",
    scope: ["组织人员、岗位、关键岗位与数据范围", "绩效周期、方案版本和上级审批", "源数据暂存、质量检查、对账和数据追溯", "风险合规调整与责任认定", "结果联合复核、发布基础与跨期冲正", "权限审计、集成调度、备份恢复基线"],
    dependencies: ["HR／IAM 主数据与身份接口约定", "各源系统数据责任部门和接口口径", "风险、合规、审计事件与责任认定规则", "本行制度审批、数据分级和业务影响分析"],
    acceptance: ["任一正式结果可回放规则、数据和组织快照", "质检失败不能核算，对账差异必须处理并留存结果", "越权访问和不相容职责被服务端阻断", "重复重算应被识别，冲正不覆盖历史，审计证据完整", "完成恢复演练和高峰期容量验证"],
  },
  {
    phase: "P1", name: "员工办理与薪酬衔接", timing: "P0 结果模型稳定后",
    objective: "让员工结果可理解、可确认、可申诉，并把绩效结果安全衔接到薪酬、递延和追索。",
    scope: ["目标分解与年中调整", "员工自助结果、方案确认与申诉", "薪酬接口、递延、止付、追回与回执对账", "经营分析、董事会审查、监管报送和披露", "更完整的归属逐级汇总与争议锁定"],
    dependencies: ["P0 结果、权限和审计基础", "薪酬／财税／支付系统接口与权威回执", "员工通知、材料和劳动合同配套", "监管报送与披露口径责任人"],
    acceptance: ["员工只能查看本人结果，申诉全流程可追踪", "申诉成立通过冲正补录更正，原结果仍可查", "积分、薪酬和支付四本账可勾稽且边界无混淆", "递延与追索覆盖适用人员并支持年度审核", "报送、披露和内部报表同口径一致"],
  },
  {
    phase: "P2", name: "方案对比与多机构运营", timing: "持续数据沉淀后按价值扩展",
    objective: "在可信历史数据上开展方案对比和经营分析，按实际业务需要扩展多机构运营。",
    scope: ["不同方案的积分、成本与激励效果对比", "目标达成、异常波动与机构经营分析", "多法人、多地区、多币种和更复杂计划", "公式自动检查与数据质量分析", "多机构共享服务和运营效率优化"],
    dependencies: ["足量且可信的历史结果与支付数据", "多法人及跨境业务实际需求和合规评估", "自动检查规则、解释口径和独立验证机制", "明确的成本收益与使用场景"],
    acceptance: ["模拟假设、版本和影响范围可复现", "方案对比与正式核算隔离，不直接改写结果", "自动检查结果可解释、可复核，并能由有权人确认处理", "多实体权限、口径和数据隔离通过专项测试", "以运营和激励效果指标证明扩展价值"],
  },
];

export const externalDependencies = [
  { name: "HR／IAM", boundary: "提供权威组织、人员、岗位、任职和身份权限；平台不另造人员真相源。" },
  { name: "核心与业务源系统", boundary: "提供客户、账户、交易、产品和财务事实；平台不通过手工录入冒充自动接入。" },
  { name: "风险合规与审计", boundary: "提供事件、评价、整改与责任认定；平台执行经审批的调整，不替代专业定性。" },
  { name: "薪酬、税务与支付", boundary: "负责薪酬结构、个税、实付与资金回执；平台不将积分或接口回执当作实际工资。" },
  { name: "监管报送与披露", boundary: "按本机构、属地和最新监管口径复核报送；通用建设方案不预置虚构监管接口或报送成功状态。" },
];
