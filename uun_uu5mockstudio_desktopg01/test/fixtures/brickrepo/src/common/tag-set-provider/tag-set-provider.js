import { createComponent, useDataObject } from "uu5g05";
const TagSetProvider = createComponent({ uu5Tag: "TagSetProvider", render(props) { const d = useDataObject({ handlerMap: { load: () => null } }); return props.children; } });
export default TagSetProvider;
