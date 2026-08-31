import { FileText } from 'lucide-react';
import feishuLogo from '../../../../../../resources/brands/feishu.png';
import wecomLogo from '../../../../../../resources/brands/wecom.png';
import dingtalkLogo from '../../../../../../resources/brands/dingtalk.png';
import meetingLogo from '../../../../../../resources/brands/tencent-meeting.png';

const connectorLogos: Record<string, string | undefined> = {
  'feishu-cli': feishuLogo,
  'wecom-cli': wecomLogo,
  'dingtalk-cli': dingtalkLogo,
  'tencent-meeting-cli': meetingLogo,
};

/** Decorative connector identity; its adjacent label remains the catalog's display name. */
export function PartnerConnectorIcon({
  adapter,
  className,
}: {
  readonly adapter: string;
  readonly className: string;
}): JSX.Element {
  return connectorLogos[adapter] ? (
    <img
      src={connectorLogos[adapter]}
      width={24}
      height={24}
      alt=""
      aria-hidden
      data-testid="partner-connector-icon"
      className={`object-contain ${className}`}
    />
  ) : (
    <FileText className={className} aria-hidden data-testid="partner-connector-icon" />
  );
}
