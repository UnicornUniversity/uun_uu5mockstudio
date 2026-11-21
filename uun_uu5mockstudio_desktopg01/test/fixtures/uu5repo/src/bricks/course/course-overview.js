import { createVisualComponent, PropTypes, useState } from "uu5g05";
import Uu5Elements from "uu5g05-elements";
import { useDataList } from "uu5g05";
import Calls from "../../calls.js";
import CourseHeader from "./course-header.js";
import CourseProvider from "./course-provider.js";
import { useCourse } from "../../hooks/use-course.js";

function ObjectiveItem({ objective }) {
  return <Uu5Elements.ListItem>{objective.name}</Uu5Elements.ListItem>;
}

const CourseOverview = createVisualComponent({
  uu5Tag: "UuCourse.CourseOverview",
  propTypes: { courseId: PropTypes.string.isRequired, onEdit: PropTypes.func },
  defaultProps: { onEdit: undefined },
  render(props) {
    const [open, setOpen] = useState(false);
    const { data } = useCourse(props.courseId);
    const objectives = useDataList({ handlerMap: { load: Calls.objectivesList, create: Calls.objectiveCreate } });
    return (
      <CourseProvider courseId={props.courseId}>
        <Uu5Elements.Block header={data?.name}>
          <CourseHeader course={data} onEdit={props.onEdit} />
          {objectives.state === "pending" ? <Uu5Elements.Pending /> : objectives.data.map((o) => <ObjectiveItem key={o.id} objective={o} />)}
          {open && <Uu5Elements.Modal open onClose={() => setOpen(false)} />}
        </Uu5Elements.Block>
      </CourseProvider>
    );
  },
});
export default CourseOverview;
