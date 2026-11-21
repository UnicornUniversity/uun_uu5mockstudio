import { createVisualComponent, PropTypes } from "uu5g05";
import Uu5Elements from "uu5g05-elements";
const CourseHeader = createVisualComponent({
  uu5Tag: "UuCourse.CourseHeader",
  propTypes: { course: PropTypes.object, onEdit: PropTypes.func },
  render(props) { return <div className="h"><Uu5Elements.Text category="interface" segment="title">{props.course?.name}</Uu5Elements.Text><Uu5Elements.Button onClick={props.onEdit} /></div>; },
});
export default CourseHeader;
