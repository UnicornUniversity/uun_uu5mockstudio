import { createVisualComponent, PropTypes, useState } from "uu5g05";
import { Modal, Pending, ListItem, ScrollableBox } from "uu5g05-elements";
import { Form, SubmitButton } from "uu5g05-forms";
import Uu5DnD from "uu5dndg01";

const DraggableListItem = Uu5DnD.withDraggable(ListItem, { sourceRefProp: "iconDragRef" });
const DraggableList = Uu5DnD.withDroppableItemList(ScrollableBox, DraggableListItem);

const SectionsModal = createVisualComponent({
  uu5Tag: "SectionsModal",
  propTypes: { onClose: PropTypes.func, shown: PropTypes.bool },
  render(props) {
    const [tabCode] = useState("a");
    if (!props.shapeDataObject?.data) {
      return <Modal open={props.shown}><Pending size="m" /></Modal>;
    }
    return (
      <Form.Provider>
        <Modal open={props.shown} footer={<SubmitButton />}>
          {tabCode === "a" ? <DraggableList itemList={[]} /> : <DraggableList itemList={[]} />}
        </Modal>
      </Form.Provider>
    );
  },
});
export default SectionsModal;
