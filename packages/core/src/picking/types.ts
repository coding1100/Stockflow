export type Channel = 'STORE' | 'ECOM' | 'MARKETPLACE' | 'WHOLESALE';

export type SlaBucket = 'OVERDUE' | 'SOON' | 'TODAY' | 'FUTURE';

export interface OrderLine {
  skuId: string;
  quantity: number;
  allocatedBinId: string | null;
}

export interface OrderForPlanning {
  id: string;
  channel: Channel;
  slaDueAt: Date;
  lineItems: OrderLine[];
}

export interface OrderPlanInfo extends OrderForPlanning {
  slaBucket: SlaBucket;
  zonesTouched: string[];
  unitCount: number;
  lineCount: number;
}
