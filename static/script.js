/**
 *  https://visjs.github.io/vis-network/docs/network/ -- док. по работе на холсте с графом
 */

let viz
let driver
let username, password
let updateHandler
let selectorsID = ["relationshipEnd", "relationshipStart",
    "nodeSelect", "oneWayFilterSelector", "depthFilterSelector"]
let topicsID = ["newTopic", "topic"]
let serverUrl = "neo4j://176.57.217.75:7687"
// будет хранить в реляционной БД
let communities = []
let newPropertysLabelCount = 0
let newPropertysTypeCount = 0
let config
let desk = ""
let deskDefault = "Basic"
let firstNodeID = -1
let secondNodeID = -1
let vizualHandlersApplyed = false
const deskInterest = {
    RELATION: 0,
    DESK: 1,
    RELDESK : 2
}

function getGraphInfo() {
    desk = getDeskName()
    getLoginInfo()
    neo4jLogin()
    updateMenu()
    draw() 
    start()
    updateGraph(false, true)
}

function updateGraph(reloadNeeded=false, renderNeeded=false) {
    desk = getDeskName()    
    let session = driver.session()
    session
        .run(initialCypher().connected_nodes)
        .then(result => {
            if (result.records.length === 0) {  // актуально, если ребер совсем нет                
                if (renderNeeded) {
                    console.log('1')
                    viz.renderWithCypher(initialCypher().nodes)
                } else {
                    viz.updateWithCypher(initialCypher().nodes)
                }
            }
            else if (renderNeeded){
                viz.renderWithCypher(initialCypher().connected_nodes)
                viz.updateWithCypher(initialCypher().nodes)
            } else {
                viz.updateWithCypher(initialCypher().connected_nodes)
                viz.updateWithCypher(initialCypher().nodes)
            }
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            if (reloadNeeded)                
                viz.reload()            
            setVisEventsHandlers()  // ставим обработчики событий на холсте
            session.close()
        })
}

/** выдает тексты стартового cypher-запроса */
function initialCypher(){
    let desk = getDeskName()        
    //connected_nodes выдаст только связанные между собой узлы, одиночные - нет
    return {
        'connected_nodes': 'MATCH (a)-[r]-(b) WHERE ' 
                    + deskCondition('a') + ' AND '
                    + deskCondition('b') + ' RETURN a, r',
        'nodes': 'MATCH (a) WHERE ' + deskCondition('a') + ' RETURN a'
        }
}

function getDeskName(){
    let deskValue = document.getElementById("deskSelect").value
    return deskValue ? deskValue : deskDefault    
}

/** 
 * Доп.условие к cypher запросам для сужения результатов до конкретной доски.
 * @param{string} node - обозначение узла вершины, проверяемой на принадлежность к доске
 * @param{string} desk - обозначение узла самой доски. 
 * @param{string} relation - обозначение отношения привязки к доске
 * @param{string} interest - на что ориентирован выдаваемый кусок запроса
 * @param{object} relProperties - дополнительные свойства ребра (если ориентируемся на ребро)
 */
function deskCondition(node='a', desk='', relation='', interest=deskInterest.RELDESK, relProperties={}){
    let deskName = getDeskName()
    let props = stringify(relProperties)
    props = props ? ', ' + props : '' 
        
    switch (interest){
        case deskInterest.RELDESK:
            return ' ('+node+')<-['+relation+':subsection {type:"СОДЕРЖИТ"}]-('+desk+':Доска {title:"'+deskName+'"}) '    
        case deskInterest.RELATION:
            return ' ('+node+')<-['+relation+':subsection {type:"СОДЕРЖИТ" '+props+'}]-('+desk+') '        
        case deskInterest.DESK:
            return '('+desk+':Доска {title:"'+deskName+'"})' 
    }
}

/**
 * Выдает строковое представление входного объекта
 * @param{object} объект из пар ключ-значение. Например {x:10, y:22.4, name:"HotPoint"}
 * @return{string} строковое представление объекта. Например 'x:10, y:22.4, name:"HotPoint"'
*/
function stringify(properties){
    props=[]; 
    Object.keys(properties).forEach((k)=>{
        val = properties[k]
        if (typeof(val) != 'number') {
            val = '"' + val + '"'
        }
        props.push(k+":"+val)
    }); 
    return props.join(',')
}

function start() {   
    document.getElementById("Label").add(new Option("Новый тип"))
    document.getElementById("Type").add(new Option("Новый тип"))
    fillingSelect("Label", 'MATCH (n) WHERE '+deskCondition('n')+' RETURN distinct labels(n)', 'labels(n)')
    fillingSelect("Type", 'MATCH (a)-[r]->(b) WHERE ' 
            + deskCondition('a') + ' AND '
            + deskCondition('b') + ' RETURN distinct(type(r))', "(type(r))")    
    fillingSelect("deskSelect", 'MATCH (n:Доска) RETURN distinct n.title AS desks', "desks")
    templateChanged(true, 'Label')
    templateChanged(true, 'Type')    
}

function fillingSelect(select, cypherCode, captionOfResult) {    
    let templateSession = driver.session()
    templateSession
        .run(cypherCode)
        .then(result => {       
            if (result.records == 0) console.log('no results')     
            for(let template of result.records) {                
                let captionOfTemplate = template.get(captionOfResult)                                
                document.getElementById(select).add(new Option(captionOfTemplate))
                if(select === "Label") {
                    config.labels[captionOfTemplate] = {
                        caption: "title",
                        size: "size",
                        community: "community",
                        //image: 'https://visjs.org/images/visjs_logo.png'
                    }                    
                    /*config.labels["Node"] = {  // если индивидуально под вершину
                        caption: "title",
                        size: "size",
                        community: "topicNumber",
                        image: 'https://visjs.org/images/visjs_logo.png'
                    }*/
                }
            }
        })
        .catch(error => {console.log(error)})
        .then(() => {
            templateSession.close()
        })
}

function templateChanged(isFirstLevel, templateType) {
    document.getElementById("div3" + templateType).innerHTML = ""
    let templatesSelector = document.getElementById(templateType)
    if(templatesSelector.options[templatesSelector.selectedIndex].text === "Новый тип" && isFirstLevel) {
        document.getElementById("div2" + templateType).innerHTML = ""
        document.getElementById("div1" + templateType).innerHTML = '<label>Имя типа:</label><br>' +
        '<input type="text" id="nameOf' + templateType + '"><br>' +
        '<label>Унаследован от:</label><br>' +
        '<select id="extends' + templateType + '"'
        + '" onChange="templateChanged(false, \'' + templateType + '\')"></select><br>'
        document.getElementById("extends" + templateType).add(new Option("Не унаследован"))
        if(templateType === "Label") {
            fillingSelect("extends" + templateType, 
                'MATCH (n)  WHERE ' + deskCondition('n') + ' RETURN distinct labels(n)', "labels(n)")
        }
        else {
            fillingSelect("extends" + templateType, 
                'MATCH (a)-[r]->(b) WHERE ' 
                + deskCondition('a') + ' AND '
                + deskCondition('b') + ' RETURN distinct(type(r))', "(type(r))")
        }
    }
    else {
        if(isFirstLevel) {
            document.getElementById("div1" + templateType).innerHTML = ""
        }
        document.getElementById("div2" + templateType).innerHTML = ""
        let session = driver.session()
        let extendsTemplatesSelector = document.getElementById("extends" + templateType)
        let nameOfLabel = isFirstLevel ? templatesSelector.options[templatesSelector.selectedIndex].text
        : extendsTemplatesSelector.options[extendsTemplatesSelector.selectedIndex].text
        let cypher = templateType 
        if (cypher === "Label") {
            cypher = 'MATCH (a:' + nameOfLabel + ') WHERE ' + deskCondition('a') 
                + ' UNWIND keys(a) AS key RETURN distinct key'
        }
        else {
            cypher = "match (a)-[r:" + nameOfLabel + "]->(b) WHERE " 
                + deskCondition('a') + " AND "
                + deskCondition('b') + " Unwind keys(r) AS key return distinct key"
        }
        session
            .run(cypher)
            .then(result => {
                for(let property of result.records) {
                    if(property.get("key") !== "title" && property.get("key") !== "size" 
                        && property.get("key") !== "id" && property.get("key") !== "community"
                        && property.get("key") !== "desk") {
                        document.getElementById("div2" + templateType).innerHTML +=
                        '<label>' + property.get("key") + ':</label><br>' +
                        '<input type = "text" id = "' + property.get("key") + '"><br>'
                    }
                }
            })
            .catch(error => {
                console.log(error)
            })
            .then(() => {
                session.close()
            })
    }
    newPropertysLabelCount = 0
    newPropertysTypeCount = 0
}

function addPropertyClick(templateType) {
    let numberOfNewProperty = 0
    let propertys = []
    let propertysValues = []
    let newPropertysCount = templateType === "Label" ? newPropertysLabelCount : newPropertysTypeCount
    while (document.getElementById("property" + templateType + numberOfNewProperty) != null) {
        propertys.push(document.getElementById("property" + templateType + numberOfNewProperty).value)
        propertysValues.push(document.getElementById("property" + templateType + numberOfNewProperty++ + "Value").value)
    }
    document.getElementById("div3" + templateType).innerHTML += '<label>Имя свойства:</label><br>' +
    '<input type = "text" id = "property' + templateType + newPropertysCount + '"<br>' +
    '<br><label>Значение:</label><br>' +
    '<input type = "text" id = "property' + templateType + newPropertysCount++ + 'Value"<br><br>'
    for(let i = 0; i < propertys.length; i++) {
        document.getElementById("property" + templateType + i).value = propertys[i]
        document.getElementById("property" + templateType + i + "Value").value = propertysValues[i]
    }
    if(templateType === "Label") {
        newPropertysLabelCount = newPropertysCount
    }
    else {
        newPropertysTypeCount = newPropertysCount
    }
}

function replacementSpaces(caption) {
    let indexOfSpace
    while ((indexOfSpace = caption.indexOf(" ")) != -1) {
        caption = caption.slice(0, indexOfSpace) + "_" + caption.slice(indexOfSpace + 1)
    }
    return caption
}

function addRelations() {
    if(firstNodeID < 0 || secondNodeID < 0) {
        alert(firstNodeID + "," + secondNodeID)
        return
    }
    let cypher = "match(a) where a.id = " + firstNodeID + " match(b) where b.id = " + secondNodeID + " create (a)-[r:"
    let typeSelect = document.getElementById("Type")
    if(typeSelect.options[typeSelect.selectedIndex].text === "Новый тип") {
        if(document.getElementById("nameOfType") === "") {
            return
        }
        cypher += replacementSpaces(document.getElementById("nameOfType").value)
    }
    else {
        cypher += replacementSpaces(typeSelect.options[typeSelect.selectedIndex].value)
    }
    let propertys = readPropertys("Type")
    let isFirstProperty = propertys === "" ? true : false
    cypher += " {" + propertys + "}]->(b)"
    let session = driver.session()
    session
        .run(cypher)
        .then(() => {})
        .catch((error) => {
            console.log(error)
            alert("Неполучилось создать связь. Возможно вы где-то ввели недопустимый символ")
            alert(cypher)
        })
        .then(() => {
            session.close()
            updateGraph()
            updateMenu()
        })
    newPropertysTypeCount = 0
    templateChanged(isFirstLevel, "Type")
}

function readPropertys(templateType) {
    let cypher = ""
    let startOfIDProperty = 0
    let propertysHTML = document.getElementById("div2" + templateType).innerHTML
    let isFirstProperty = true
    while (true) {
        startOfIDProperty = propertysHTML.indexOf("=", startOfIDProperty)
        if(startOfIDProperty == -1) {
            break
        }
        if(!isFirstProperty) {
            cypher += ","
        }
        startOfIDProperty = propertysHTML.indexOf("=", ++startOfIDProperty)
        startOfIDProperty += 2;
        let endOfIDProperty = startOfIDProperty;
        while(propertysHTML[endOfIDProperty] != '"') {
            endOfIDProperty++;
        }
        let propertyCaption = replacementSpaces(propertysHTML.slice(startOfIDProperty, endOfIDProperty))
        cypher += propertyCaption + ': "' + document.getElementById(propertyCaption).value + '"'
        isFirstProperty = false
    }
    let newPropertyNumber = 0;
    while(document.getElementById("property" + templateType + newPropertyNumber) != null) {
        if(document.getElementById("property" + templateType + newPropertyNumber).value === "") {
            newPropertyNumber++
            continue
        }
        if(!isFirstProperty) {
            cypher += ","
        }
        if(document.getElementById("property" + templateType + newPropertyNumber).value === "") {
            continue
        }
        cypher += replacementSpaces(document.getElementById("property" + templateType + newPropertyNumber).value) + ': "' +
        document.getElementById("property" + templateType + newPropertyNumber++ + "Value").value + '"'
        isFirstProperty = false
    }
    return cypher
}

/** 
 * Считывает название Типа вершины из поля формы. Если это "Новый тип",
 * то для него создается раздел в config.labels. 
 * @return {object} контейнер с названием и сведениями о состоянии
 *   {
       name: название типа, 
 *     isNew: флаг - новый ли,
 *     isFirstLevel: флаг - верхний ли уровень наследования,
 *     error: флаг ошибки
 *    }
 */
function handleTemplateName(){
    let result = {name: "", isNew: false, isFirstLevel: false, error: false}

    let templatesSelector = document.getElementById("Label")
    if(templatesSelector.options[templatesSelector.selectedIndex].text === "Новый тип") {
        result.isNew = true
        if(document.getElementById("nameOfLabel").value === "") {
            result.error = true
        } else {
            result.isFirstLevel = true
            result.name = replacementSpaces(document.getElementById("nameOfLabel").value)
            document.getElementById("extendsLabel").add(new Option(result.name))        
            templatesSelector.add(new Option(result.name))
            config.labels[result.name] = {
                caption: "title",
                size: "size",
                community: "community"
            }
        } 
    }
    else {
        result.name = templatesSelector.options[templatesSelector.selectedIndex].text
    }
    return result
}

/** Добавляет вершину выбранного типа в граф */
function addNodeByTamplateClick() {
    if(document.getElementById("caption").value === "") {
        return
    }
    templateInfo = handleTemplateName()
    if (templateInfo.error) {
        return
    }
    let session = driver.session()
    session
        .run("MATCH (n:" + templateInfo.name + ") RETURN n.community")
        .then(result => {
            let community = result.records[0].get("n.community")

            let cypher ="MATCH (n) WITH max(n.community) AS last_community, max(n.id) AS last_ID " 
            cypher += "MATCH " + deskCondition('', 'd', interest=deskInterest.DESK) 
            cypher +=" CREATE (a:" + templateInfo.name
            
            // собираем в запрос свойства
            let propertys = readPropertys("Label")
            let isFirstProperty = propertys === "" ? true : false
            cypher += "{" + propertys
            if (!isFirstProperty) {
                cypher += ","
            }
            
            let community_id = templateInfo.isNew ? " last_community+1 " : community

            cypher += ' title: "' + document.getElementById("caption").value + '", '
            cypher += ' id: last_ID+1, '
            cypher += ' community: ' + community_id  + ', '            
            cypher += ' x: 0, y: 0, '
            let sizeVal = document.getElementById("size")
                                  .options[document.getElementById("size").selectedIndex]
                                  .value
            cypher += ' size:' + sizeVal + '}) '
            let coords = {x:0, y:0}
            cypher += 'CREATE ' + deskCondition('a', 'd', interest=deskInterest.RELATION, relProperties=coords)  // создаем связь до доски                    

            // добавляем в граф вершину с заданным типом, свойствами и привязкой к доске
            var subSession = driver.session()
            subSession
                .run(cypher)
                .then(() => {})
                .catch(error => {
                    console.log(error)
                    alert("Не получилось добавить вершину. Возможно вы где-то ввели недопустимый символ.")
                    alert(cypher)
                })
                .then(() => {
                    session.close()
                    updateGraph()
                    updateMenu()
                }) 

        })
        .catch(error => {
            console.log(error)
            alert("Ошибка запроса к БД. Не удалось прочитать тип вершины.")            
        })

    newPropertysLabelCount = 0
    templateChanged(templateInfo.isFirstLevel, "Label")
    document.getElementById("caption").value = ""
}

function clickOnULSearch(event, node, UL) {
    let selectedNodeId = event.target.closest("li").value
    let nodeSelector = document.getElementById("nodeSelect")
    for (let i = 0; i < nodeSelector.options.length; i++){
        if (nodeSelector.options[i].value == selectedNodeId) {
            document.getElementById(node).value = nodeSelector.options[i].text
            clearUL(UL)
            if(node === "firstNode") {
                firstNodeID = selectedNodeId
            }
            else {
                secondNodeID = selectedNodeId
            }
            return
        }
    }
}

function clearUL(UL) {
    let list = document.getElementById(UL)
    while (list.hasChildNodes()) {
        list.removeChild(list.firstChild);
    }
}

//!!! Костыль ([:subsection*0..100]) не показывает деревья с больше чем 100 этажей
function addOneWayFilter() {
    viz.updateWithCypher("MATCH p = ({id:" + document.getElementById("oneWayFilterSelector").value
        + "})-[:subsection*0..100]->()  RETURN p")
}

function showOneWayFilter() {
    viz.renderWithCypher("MATCH p = ({id:" + document.getElementById("oneWayFilterSelector").value
        + "})-[:subsection*0..100]->()  RETURN p")
}

/**
 * Выбирает вершины на глубину указанную в html-элементе с id='depth'.
 * @param refresh[boolean] сбрасывать текущую визуализацию или дописать в нее
 */
 // TODO: переписать условие с использованием deskCondition
function addDepthFilter(refresh=true) {

    let depth = parseInt(document.getElementById("depth").value)
    if (isNaN(depth)) {
        alert("Глубина должна быть указана целым числом больше нуля")
        return
    }

    if (refresh) {
        viz.clearNetwork()    
    }
    for (let i = depth; i >= 0; i--){
        let cypher = "MATCH p = ("
        cypher += '{id:' + document.getElementById("depthFilterSelector").value + ', '
        cypher += 'desk:"' + getDeskName() + '"' + '})'
        cypher += '-[:subsection*' + i + ']-()  RETURN p'        

        viz.updateWithCypher(cypher)            
    }
}

function searchNodeByName(inputNode, UL, clickOnULFunction) {
    let input = document.getElementById(inputNode).value.toLowerCase().trim()
    let list = document.getElementById(UL)
    clearUL(UL)
    if (input === ""){return}
    let nodeSelector = document.getElementById("nodeSelect")
    for (let i = 0; i < nodeSelector.options.length; i++){
        if (nodeSelector.options[i].text.toLowerCase().indexOf(input) >= 0) {
            console.log(input + " : " + nodeSelector.options[i].text.toLowerCase())
            let li = document.createElement("li")
            li.value = nodeSelector.options[i].value
            li.onclick = (event) => clickOnULFunction(event, inputNode, UL)
            let a = document.createElement("a")
            a.text = nodeSelector.options[i].text

            li.appendChild(a)
            list.appendChild(li)
        }
    }
}

function clickOnUL(event) {
    let selectedNodeId = event.target.closest("li").value
    let nodeSelector = document.getElementById("nodeSelect")
    for (let i = 0; i < nodeSelector.options.length; i++){
        if (nodeSelector.options[i].value == selectedNodeId) {
            nodeSelector.selectedIndex = i
            getSelectedNodeInfo()
            return
        }
    }
}

function draw() {    
    config = {
        container_id: "viz",
        server_url: serverUrl,
        server_user: username,
        server_password: password,
        labels: {  // не влияет на ситуацию - config.labels перезаписывается в других местах 
            "Node": {
                caption: "title",
                size: "size",
                community: "topicNumber"
            }
        }, 
        relationships: {
            "subsection": {
                caption: "type",
                thickness: "thickness",
                title_properties: false
            } 
        },
        arrows: true,
        initial_cypher: initialCypher().connected_nodes
    }

    viz = new NeoVis.default(config)
    console.log(viz)
    viz.render()
}

async function neo4jLogin() {
    driver = neo4j.driver(serverUrl, neo4j.auth.basic(username, password), {encrypted: 'ENCRYPTION_OFF'})
    driver.onError = error => {
        console.log(error)
    }

    try {
        await driver.verifyConnectivity()
    } catch (error) {
        alert("Ошибка аутентификации")
    }
}

function getLoginInfo() {
    const menu = document.forms.graphMenu
    serverUrl = document.getElementById("url").value
    username = menu.elements.username.value
    password = menu.elements.password.value
}

function addNode() {
    let availableId = 0
    var idSession = driver.session()
    idSession
        .run("MATCH (p) RETURN p.id ORDER BY p.id DESC LIMIT 1")
        .then(result => {
            result.records.forEach(record => {
                availableId = 1 + parseInt(record.get("p.id"))
            })
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            idSession.close()
        })
        .then(() => {
            var createSession = driver.session()
            let topic = document.getElementById("newTopic").value
            if (topic === "Создать новую тему") {
                topic = document.getElementById("newTitle").value
                communities.push(topic)
            }
            createSession
                .run("CREATE (a" + availableId + ":Node {title: \"" + document.getElementById("newTitle").value +
                    "\", topic:\"" + topic +
                    "\", topicNumber:" + communities.indexOf(topic) +
                    ", description:\"" + document.getElementById("newDesc").value +
                    "\", use: [\" " + document.getElementById("newUse").value.split(",").join("\" , \"") + 
                    " \"], id:" + availableId + 
                    ", size:" + parseFloat(document.getElementById("newType").value) + "})")
                .then(() => {
                })
                .catch(error => {
                    console.log(error)
                })
                .then(() => {
                    createSession.close()
                    updateGraph()
                    updateMenu()
                })
        })
}

function changeNode() {
    var setSession = driver.session()
    setSession
        .run(
            "MATCH (p {id:" + document.getElementById("nodeSelect").value + "})" +
            " SET p.title = \"" + document.getElementById("title").value + "\"" +
            " SET p.description = \"" + document.getElementById("desc").value + "\"" +
            " SET p.use = [\"" + document.getElementById("use").value.split(",").join("\" , \"") + "\"]" +
            " SET p.size = " + parseFloat(document.getElementById("type").value)
        )
        .then(result => {
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            setSession.close()
            updateGraph()
            updateMenu()
        })
} 

function removeNode() {
    var session = driver.session()    
    session
        .run("MATCH (p) WHERE p.id =" + document.getElementById("nodeSelect").value + " DETACH DELETE p")
        .then(result => {
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            session.close()
            //updateGraph(true)
            visualID = getVisualNodeIdByRealId(document.getElementById("nodeSelect").value)            
            viz._network.selectNodes([visualID])  // выделяем на холсте узел
            viz._network.deleteSelected()   // удаляем его из визуализации
            updateMenu()
        })
}

function updateMenu() {
    for (let i = 0; i < selectorsID.length; i++)
        clearSelect(selectorsID[i])
    for (let i = 0; i < topicsID.length; i++)
        clearSelect(topicsID[i])
    let text = "Создать новую тему"
    document.getElementById("newTitle").value = ""
    document.getElementById("newDesc").value = ""
    document.getElementById("newUse").value = ""
    document.getElementById("newTopic").add(new Option(text, text, false, false))
    getNodes()
}

function clearSelect(selectID) {
    for (let i = document.getElementById(selectID).options.length - 1; i >= 0; i--)
        document.getElementById(selectID).options[i] = null
}

function addRelationship() {
    let startNodeId = document.getElementById("relationshipStart").value
    let endNodeId = document.getElementById("relationshipEnd").value
    let relationshipType = document.getElementById("relationshipType").value
    var session = driver.session()
    session
        .run(`MATCH (a) , (b) WHERE a.id = ${startNodeId} AND b.id = ${endNodeId}  CREATE (a)-[:subsection {type: "${relationshipType}"}]->(b)`)
        .then(result => {
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            session.close()
            updateGraph()
        })

}

function removeRelationship() {
    let startNodeId = document.getElementById("relationshipStart").value
    let endNodeId = document.getElementById("relationshipEnd").value
    var session = driver.session()
    session
        .run("MATCH (a {id:" + startNodeId + "})-[r:subsection]->(b {id:" + endNodeId + "}) DELETE r")
        .then(result => {
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            session.close()
            updateGraph(true)
        })
}

function getNodes() {
    //{desk:"' + getDeskName() + '"}
    var session = driver.session()
    session
        .run('MATCH (p) RETURN p.id, p.title ORDER BY p.id')
        .then(result => {
            result.records.forEach(record => {
                let text = "<" + record.get("p.id") + ">:" + record.get("p.title")
                for (let i = 0; i < selectorsID.length; i++)
                    document.getElementById(selectorsID[i]).add(new Option(text, record.get("p.id"), false, false))
            })
        })
        .catch(error => {
            console.log(error) 
        })
        .then(() => {
            var subSession = driver.session()
            subSession
                .run('MATCH (p) RETURN DISTINCT p.topic, p.topicNumber')
                .then(result => {
                    result.records.forEach(record => {
                        communities[record._fields[1]] = (record._fields[0])
                    })
                })
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => {
            session.close()
            getSelectedNodeInfo()
        })
}

function getSelectedNodeInfo() {
    var session = driver.session()
    let id = document.getElementById("nodeSelect").value
    if (id === "") return
    session
        .run("MATCH (p {id: " + id + "}) RETURN p.description, p.use, p.title, p.topic, p.size LIMIT 1")
        .then(result => {
            result.records.forEach(record => {
                document.getElementById("desc").value = record.get("p.description")
                document.getElementById("title").value = record.get("p.title")
                document.getElementById("topic").value = record.get("p.topic")
                document.getElementById("use").value = record.get("p.use").join(", ")

                let size = record.get("p.size")
                let sizeOptions = document.getElementById("type").options
                for (let i = 0; i < sizeOptions.length; i++) {
                    if (size == sizeOptions[i].value) {
                        document.getElementById("type").selectedIndex = i
                        break
                    }
                }
            })
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => session.close())
}

/**
 * По ID вершины от визуализатора считывает известные ему свойства вершины
 * @param {number} ID вершины на холсте
 * @return {object} объект со свойствами ключ-значение, например {'id':'5', 'use':'IT'}
 */
function getVisualNodeProperties(visualId){
    let props = {}
    // извлечем свойства из поля title вершины (должен быть способ лучше)
    nodePropertiesString = viz._nodes[visualId].title    
    nodePropertiesString.split('<br>').forEach((line, i, arr) => {
        let keyVal = line.replace('<strong>','').replace('</strong>','').split(':')        
        if (keyVal[0].length > 0) {
            props[keyVal[0]] = keyVal[1].trim()
        }
    })
    return props
}

/**
 * Находит ID вершины на холсте по переданному ID из базы данных (они существуют независимо)
 * @param {number} ID вершины в БД
 * @return {number} ID этой же вершины на холсте
 */
function getVisualNodeIdByRealId(realID){
   visualIdList = Object.keys(viz._nodes)
   nodes_quantity = visualIdList.length
    for (i=0; i<nodes_quantity; i++){        
        visualId = visualIdList[i]
        let properties = getVisualNodeProperties(viz._nodes[visualId].id)
        
        if (parseInt(properties.id) == parseInt(realID)){
            return visualId
        }
    }
    return -1
}

/**
 * Сохраняет координаты вершин с холстав в БД
 */
function saveCoordinates(){        
    let pos = viz._network.getPositions()  // считаем все координаты всех вершин 
    // в виде в pos={{0:{x:-10, y:15}, {0:{x:154, y:165}, ... }

    // соберем все в один запрос
    let cypherMatchNodes = ' MATCH '
    let cypherMatchRelations = ' MATCH '
    let cypherSET = ' SET '
    Object.keys(pos).forEach(visualId => {        
        id = parseInt(getVisualNodeProperties(visualId).id)
        nodeName = 'id' + id
        relName = 'r' + id 
        cypherMatchNodes += '(' + nodeName +' {id: ' + id + '}), '
        cypherMatchRelations += deskCondition(nodeName, 'd', relName, deskInterest.RELDESK) + ', '
        cypherSET += relName + '.x=' + pos[visualId].x + ', ' 
        cypherSET += relName + '.y=' + pos[visualId].y + ', ' 
    })
    cypherMatchNodes = cypherMatchNodes.slice(0, -2); //отрежем ', ' с хвостов
    cypherMatchRelations = cypherMatchRelations.slice(0, -2);
    cypherSET = cypherSET.slice(0, -2)
    
    cypher = cypherMatchNodes + cypherMatchRelations + cypherSET 
 
    //и отправим на сервер
    var session = driver.session()    
    session
        .run(cypher)
        .then(result => {})
        .catch(error => {
            console.log(error)
        })
        .then(() => session.close())
}

/** 
 * Расставляет вершины по сохраненным ранее в базе координатам
 */
function restoreCoordinates(){
    var session = driver.session()    
    let cypher = 'MATCH ' + deskCondition('a', 'd', 'r') + ' RETURN a.id AS nodeID, r.x AS x, r.y AS y'    
    session
        .run(cypher)
        .then(result => {          
            result.records.forEach(record => { 
                let x = record.get('x').low                                    
                let y = record.get('y').low
                let realID = record.get('nodeID').low                
                if (x != 0 || y!= 0) {
                    let visualID = getVisualNodeIdByRealId(realID)                                
                    viz._network.moveNode(visualID, x, y) 
                }
            })            
        })
        .catch(error => {
            console.log(error)
        })
        .then(() => session.close())    
}

/*=================== Обработка событий ================*/

/**
 * Привязывает обработчик к событию выбора вершины
 * (чтобы выбрать несколько нужен длинный click или Ctrl+click по каждой следующей).
 * Вторая выбранная вершиная ставится выбранной во втором select форме создания связи
 */
function setNodeSelectHandler(){    
    viz._network.on('selectNode', (param) => {  
        if (param.nodes.length <= 1) {  // т.е. если выделено меньше 2х вершин - не интересно
            return
        }
        let currentNodeId = viz._network.getNodeAt(param.pointer.DOM); // вершина под событием
        let properties = getVisualNodeProperties(currentNodeId)
        realID = parseInt(properties.id)

        // ставим выбранной нужную вершину и симулируем клик по select-ам        
        if (realID != NaN) { 
            // форма создания ребра - во второй select    
            document.getElementById('relationshipEnd').value = realID
            document.getElementById('relationshipEnd').dispatchEvent(new MouseEvent('change'))             
        }        
    })
}

/**
 * Привязывает обработчик к клику по вершине.
 * Кликнутая вершина ставится выбранной в формах c select-ами по вершинам
 */
function setNodeClickHandler(){    
    viz._network.on('click', (param) => {  // по клику на холст
        if (param.nodes.length == 0) {
            return
        }
        if (viz._network.getSelectedNodes().length == 1){  
            nodeIdAtCanvas = param.nodes[0]  // ID вершины на холсте, не совпадает с ID в БД        
            let properties = getVisualNodeProperties(nodeIdAtCanvas)
            realID = parseInt(properties.id)
            if (realID != NaN) {
                // ставим выбранной нужную вершину и симулируем клик по select-ам
                document.getElementById('nodeSelect').value = realID
                document.getElementById('nodeSelect').dispatchEvent(new MouseEvent('change'))

                document.getElementById('relationshipStart').value = realID
                document.getElementById('relationshipStart').dispatchEvent(new MouseEvent('change'))

            }
        }
        
    })
}

/** Как только закончится стабилизация графа - включаем режим ручной расстановки вершин*/
function setStabilizedHandler(){
    viz._network.on('stabilized', (param) => {
        // отключим физику и сделаем ребрa бесконечно растяжимыми
        viz._network.physics.physicsEnabled = false
        viz._network.setOptions({
            edges: {
                smooth: {
                    type: 'continuous' // dynamic, continuous, discrete, diagonalCross, straightCross, horizontal, vertical, curvedCW, curvedCCW, cubicBezier
                }
            }
        }) 

        restoreCoordinates()  // расставим вершины по сохраненным позициям
    })    
}


/**
 * Ставит обработчики на элементы холста, как только он прорисовался
 * (до этого объект viz._network равен null)
 */
function setVisEventsHandlers(){
    viz.registerOnEvent("completed", (e)=>{
        // разрешим множественное выделение
        viz._network.interactionHandler.selectionHandler.options.multiselect = true

        setNodeSelectHandler()
        setNodeClickHandler()  
        setStabilizedHandler()                   
    });
}

/*=================== END Обработка событий ================*/


