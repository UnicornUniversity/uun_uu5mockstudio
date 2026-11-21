import { createVisualComponent, PropTypes, useState } from "uu5g05";
import Uu5Elements from "uu5g05-elements";
import { Shape } from "uu_editablestructuredcontentg02-core";
import Content from "./content.js";
import SectionsModal from "./sections-modal.js";
const View = createVisualComponent({
  uu5Tag: "View",
  propTypes: { oid: PropTypes.string, configShapeDataObject: PropTypes.object },
  render(props) {
    const shape = Shape.useShape();
    const [open, setOpen] = useState(false);
    return (
      <Uu5Elements.Block header="Course overview">
        <Content shapeDataObject={shape} />
        {open && <Uu5Elements.Dialog open onClose={() => setOpen(false)} />}
        <SectionsModal shown={open} />
      </Uu5Elements.Block>
    );
  },
});
export default View;
