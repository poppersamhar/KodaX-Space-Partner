import { FileText } from 'lucide-react';
import feishuLogo from '../../../../../../resources/brands/feishu.png';

/** Decorative connector identity; its adjacent label remains the catalog's display name. */
export function PartnerConnectorIcon({
  adapter,
  className,
}: {
  readonly adapter: string;
  readonly className: string;
}): JSX.Element {
  return adapter === 'feishu-cli' ? (
    <img
      src={feishuLogo}
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
