type Registry={registerTool:(tool:{name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown|Promise<unknown>},options:{signal:AbortSignal})=>void|Promise<void>};
export type WorkspaceSnapshot={filename:string|null;pages:number;currentPage:number|null;pendingEdits:number;availableTools:string[]};
export function registerBrowserTools(getState:()=>WorkspaceSnapshot,navigate:(page:number)=>Promise<WorkspaceSnapshot>){
 const context=(document as Document&{modelContext?:Registry}).modelContext;
 if(!context?.registerTool)return()=>{};
 const controller=new AbortController();
 const register=(tool:Parameters<Registry['registerTool']>[0])=>{try{void Promise.resolve(context.registerTool(tool,{signal:controller.signal})).catch(()=>{});}catch{/* Optional browser capability. */}};
 register({name:"read_pdf_workspace",description:"Read the currently open PDF's filename, page count, selected page and pending edit count. Does not read document contents.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=="object"||Object.keys(input).length)throw new Error("Expected an empty object.");return getState();}});
 register({name:"navigate_pdf_page",description:"Navigate to a page in the open PDF, using a one-based page number. Does not alter the document or download it.",inputSchema:{type:"object",properties:{page:{type:"integer",minimum:1}},required:["page"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(!input||typeof input!=="object")throw new Error("Expected a page number.");const value=input as Record<string,unknown>;if(Object.keys(value).length!==1||!Number.isInteger(value.page))throw new Error("Invalid page number.");const state=getState();const page=value.page as number;if(page<1||page>state.pages)throw new Error("Page is outside the document.");return navigate(page);}});
 return()=>controller.abort();
}
