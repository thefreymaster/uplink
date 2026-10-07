import { Tooltip as ChakraTooltip, Portal } from '@chakra-ui/react';
import { type ReactNode, forwardRef } from 'react';

export interface TooltipProps extends ChakraTooltip.RootProps {
  content: ReactNode;
  disabled?: boolean;
  showArrow?: boolean;
}

export const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(function Tooltip(props, ref) {
  const { children, content, disabled, showArrow, ...rest } = props;
  if (disabled) return children;
  return (
    <ChakraTooltip.Root openDelay={300} closeDelay={50} {...rest}>
      <ChakraTooltip.Trigger asChild>{children}</ChakraTooltip.Trigger>
      <Portal>
        <ChakraTooltip.Positioner>
          <ChakraTooltip.Content ref={ref}>
            {showArrow && (
              <ChakraTooltip.Arrow>
                <ChakraTooltip.ArrowTip />
              </ChakraTooltip.Arrow>
            )}
            {content}
          </ChakraTooltip.Content>
        </ChakraTooltip.Positioner>
      </Portal>
    </ChakraTooltip.Root>
  );
});
