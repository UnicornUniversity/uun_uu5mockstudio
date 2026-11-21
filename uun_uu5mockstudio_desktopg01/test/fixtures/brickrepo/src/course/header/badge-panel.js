import { createVisualComponent } from "uu5g05";
import { Box, Grid, InfoItem } from "uu5g05-elements";
import { PersonItem, StateBadge } from "uu_plus4u5g02-elements";

function buildItemList({ data }) {
  return [{ title: "Owner", children: <PersonItem uuIdentity={data.owner} /> }, { title: "Size", children: data.size }];
}

const BadgePanel = createVisualComponent({
  uu5Tag: "BadgePanel",
  render({ data }) {
    const stateBadge = data.stateIcon ? <StateBadge icon={data.stateIcon} /> : null;
    const itemList = buildItemList({ data });
    const children = (
      <Grid>
        {stateBadge}
        {itemList.map((item) => <InfoItem key={item.title} {...item} />)}
      </Grid>
    );
    return <Box header={stateBadge}>{children}</Box>;
  },
});
export default BadgePanel;
