import { useDataObject } from "uu5g05";
import Calls from "../calls.js";
export function useCourse(id) { return useDataObject({ handlerMap: { load: () => Calls.courseGet({ id }) } }); }
