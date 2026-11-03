// ABOUTME: Describe the host tooltip used by the IDE status pill.
// ABOUTME: The web shell supplies the implementing package at runtime.
declare module "@deepseek-ai/dsh-client-ui-primitives" {
  export function Tooltip(props: {
    label: string;
    side?: "top";
    delayMs?: number;
    portal?: boolean;
    children?: import("react").ReactElement;
  }): import("react").ReactElement;
}
