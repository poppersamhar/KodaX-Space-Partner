import { RightSidebarFrame, type RightSidebarWidthMode } from '../../shell/RightSidebarFrame.js';
import { ArtifactPanel } from './ArtifactPanel.js';
import type { PartnerResultSelectionRequest } from './partnerResultRail.js';

interface PartnerRightSidebarProps {
  readonly width?: number;
  readonly widthMode?: RightSidebarWidthMode;
  readonly onRestoreWidth?: () => void;
  readonly onMaxWidth?: () => void;
  readonly onClose?: () => void;
  readonly selectionRequest?: PartnerResultSelectionRequest | null;
}

export function PartnerRightSidebar({
  width,
  widthMode,
  onRestoreWidth,
  onMaxWidth,
  onClose,
  selectionRequest,
}: PartnerRightSidebarProps): JSX.Element {
  return (
    <RightSidebarFrame
      width={width}
      widthMode={widthMode}
      onDefaultWidth={onRestoreWidth}
      onMaxWidth={onMaxWidth}
      onClose={onClose}
      compactWidthControls
      closeTestId="partner-artifact-panel-close"
      dockKind="partner-artifact-dock"
    >
      <ArtifactPanel selectionRequest={selectionRequest} />
    </RightSidebarFrame>
  );
}
