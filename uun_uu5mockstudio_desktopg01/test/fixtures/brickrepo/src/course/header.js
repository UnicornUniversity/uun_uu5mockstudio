//@@viewOn:imports
import { createVisualComponent, useLsi } from "uu5g05";
import { useBusinessBrick } from "uu_businessbrickg02-core";
import { useSubApp } from "uu_plus4u5g02";
import { DataObjectStateResolver, OpenBusinessBrick, OpenBusinessBrickKit } from "uu_openbusinessbrickkitg01-core";
import { Shape } from "uu_editablestructuredcontentg02-core";
import { HighlightedBox } from "uu5g05-elements";

import TagSetProvider from "../common/tag-set-provider/tag-set-provider";
import ProgressProvider from "../common/progress/provider.js";
import Config from "./config/config.js";
import View from "./header/view.js";

import importLsi from "../lsi/import-lsi.js";
//@@viewOff:imports

const Header = createVisualComponent({
  uu5Tag: Config.TAG + "Header",
  nestingLevel: View.nestingLevel,
  propTypes: {
    ...View.propTypes,
    baseUri: OpenBusinessBrickKit.Loader.propTypes.baseUri,
  },
  defaultProps: {
    ...View.defaultProps,
  },

  render(props) {
    const { ...viewProps } = props;
    const subApp = useSubApp();
    const baseUri = props.baseUri || subApp.baseUri;
    const { identifiers } = useBusinessBrick();
    const lsi = useLsi(importLsi, ["Common"]);

    const oid = props.oid || identifiers?.oid;

    const isMissing = identifiers?.entityType !== Config.EntityType && (!props.oid || !baseUri);
    if (isMissing) {
      return <HighlightedBox colorScheme="negative">{lsi.missingOid}</HighlightedBox>;
    }

    return (
      <OpenBusinessBrickKit.Loader baseUri={baseUri}>
        {({ subAppDataObject }) => (
          <DataObjectStateResolver dataObject={subAppDataObject}>
            <TagSetProvider
              artifactId={subAppDataObject?.data?.artifactId}
              baseUri={subAppDataObject?.data?.btBaseUri}
              skipInitialLoad={!subAppDataObject?.data?.artifactId}
            >
              <Shape.Provider oid={subAppDataObject?.data?.oid} searchKey={Config.SearchKeys.config} entityType="uuOpenBusinessBrickKit" historyType="none">
                {({ shapeDataObject: configShapeDataObject }) => (
                  <OpenBusinessBrick.OpenBusinessBrickLoader oid={oid}>
                    <Shape.Provider oid={oid} searchKey={Config.SearchKeys.basicAttributes} entityType="uuOpenBusinessBrick" historyType="historizable">
                      <ProgressProvider progressTemplateCode={Config.ProgressCodeTemplate.CHANGE} reloadInterval={Config.ProgressReloadInterval.NORMAL}>
                        <View {...viewProps} configShapeDataObject={configShapeDataObject} oid={oid} />
                      </ProgressProvider>
                    </Shape.Provider>
                  </OpenBusinessBrick.OpenBusinessBrickLoader>
                )}
              </Shape.Provider>
            </TagSetProvider>
          </DataObjectStateResolver>
        )}
      </OpenBusinessBrickKit.Loader>
    );
  },
});

export { Header };
export default Header;
