import type {Page} from './types';

export const navigation: {page: Page; name: string; group: string}[] = [
  {page: 'overview', name: '活动总览', group: '工作空间'},
  {page: 'documents', name: '资料库', group: '资料与知识'},
  {page: 'qa', name: '知识问答', group: '资料与知识'},
  {page: 'planning', name: '策划方案', group: '策划与执行'},
  {page: 'tasks', name: '任务看板', group: '策划与执行'},
  {page: 'budget', name: '费用预算', group: '策划与执行'},
  {page: 'copy', name: '宣传文案', group: '内容与交付'},
  {page: 'review', name: '审阅与导出', group: '内容与交付'},
];

export function currentPage(): Page {
  const key = window.location.hash.slice(1).split('/')[0];
  return navigation.find(item => item.page === key)?.page ?? 'overview';
}
