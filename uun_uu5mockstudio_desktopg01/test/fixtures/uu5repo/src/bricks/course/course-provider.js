import { createComponent, createContext } from "uu5g05";
export const CourseContext = createContext();
const CourseProvider = createComponent({
  uu5Tag: "UuCourse.CourseProvider",
  render(props) { return <CourseContext.Provider value={{ id: props.courseId }}>{props.children}</CourseContext.Provider>; },
});
export default CourseProvider;
