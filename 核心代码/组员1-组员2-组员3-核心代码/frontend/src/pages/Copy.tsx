import type {Shared} from '../types';
import {PageHeader} from '../components/Common';
import {Generator} from '../components/Generator';
export function Copy(props:Shared){return <><PageHeader eyebrow="内容与交付" title="让活动信息，准确传达" description="把活动主题、时间和参与方式，整理为可以继续编辑的宣传文案。"/><Generator {...props} kind="copy" title="宣传文案" description="一次整理适用于不同渠道的活动介绍。" placeholder="例如：生成一段公众号推文开头和一条微信群通知，语气轻松。"><div className="generation-tip"><strong>发布前核对</strong><p>确认时间、地点、报名入口与联系人。未提供的链接和个人信息，不应凭空补全。</p></div></Generator></>}
