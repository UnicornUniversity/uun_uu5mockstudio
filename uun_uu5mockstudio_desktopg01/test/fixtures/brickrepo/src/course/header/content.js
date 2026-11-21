import { createVisualComponent } from "uu5g05";
import Uu5Elements from "uu5g05-elements";
const Content = createVisualComponent({ uu5Tag: "Content", render(props) { return <Uu5Elements.Box><Uu5Elements.Grid><Uu5Elements.InfoItem /></Uu5Elements.Grid></Uu5Elements.Box>; } });
export default Content;
